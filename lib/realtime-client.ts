"use client";

/**
 * WebRTC client for the OpenAI Realtime API — a voice-first co-pilot for a
 * sales rep.
 *
 * Flow: mint an ephemeral token server-side (/api/realtime/session), open an
 * RTCPeerConnection from the browser directly to OpenAI, attach the rep's mic,
 * and open a data channel for the event side-band (transcripts + tool calls).
 * The standard OPENAI_API_KEY never reaches the browser.
 *
 * If the token route returns 503 (no key configured) connect() throws and the
 * caller falls back to a local simulated agent so the flow is fully demoable.
 */

export type RealtimeToolName =
  | "search_customer"
  | "get_customer_history"
  | "save_note"
  | "create_task"
  | "create_customer"
  | "save_call_context"
  | "get_call_context";

export type AgentActivity =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "tool_running"
  | "responding"
  | "speaking";

export interface RealtimeCallbacks {
  onStatus?: (s: "connecting" | "connected" | "closed" | "error") => void;
  /** A completed transcript turn from the rep. */
  onTranscript?: (text: string) => void;
  /**
   * Agent spoken text (fired at transcript-done, while audio may still be playing).
   * hasAudio=true means WebRTC audio is confirmed streaming AND the <audio> element
   * successfully started playback. hasAudio=false means use TTS as fallback.
   */
  onAgentText?: (text: string, hasAudio: boolean) => void;
  /** Agent activity for the orb + status line. */
  onActivity?: (activity: AgentActivity) => void;
  /** Mic input amplitude (0..1) for the reactive orb. */
  onLevel?: (level: number) => void;
  /** A server-side Realtime error event (surfaced, non-fatal). */
  onServerError?: (message: string) => void;
  /** A tool the agent invoked. Return the JSON result to feed back to it. */
  onTool?: (
    name: RealtimeToolName,
    args: Record<string, unknown>
  ) => Promise<unknown>;
  /**
   * Fired when a response that contained audio output is fully done AND the
   * client-side audio buffer has had time to drain (~600 ms after response.done).
   * Use this — not a text-length timer — to resume hands-free listening.
   */
  onAudioDone?: () => void;
}

// Explicitly request audio on every response.create. gpt-realtime-2 accepts
// either ["audio"] or ["text"], not both in the same response.
const RESPONSE_OPTS = { output_modalities: ["audio"] } as const;

function textFromResponseDone(response: unknown): string {
  if (!response || typeof response !== "object") return "";
  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";

  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const transcript = (part as { transcript?: unknown }).transcript;
      const text = (part as { text?: unknown }).text;
      if (typeof transcript === "string") parts.push(transcript);
      else if (typeof text === "string") parts.push(text);
    }
  }

  return parts.join(" ").trim();
}

const TOOLS = [
  {
    type: "function",
    name: "search_customer",
    description:
      "Find a customer by name or company. Always call this first to get the customer's id before calling any other tool that requires customerId.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "get_customer_history",
    description:
      "Get past notes and open tasks for a customer. customerId must be the id field returned by search_customer — never pass a name.",
    parameters: {
      type: "object",
      properties: {
        customerId: {
          type: "string",
          description: "The id field from search_customer results (e.g. 'cust_abc123'). Not the customer's name.",
        },
      },
      required: ["customerId"],
    },
  },
  {
    type: "function",
    name: "save_note",
    description:
      "Persist a note about a customer. customerId must be the id field from search_customer.",
    parameters: {
      type: "object",
      properties: {
        customerId: {
          type: "string",
          description: "The id field from search_customer results. Not the customer's name.",
        },
        headline: { type: "string" },
        rawText: { type: "string" },
      },
      required: ["customerId"],
    },
  },
  {
    type: "function",
    name: "create_task",
    description:
      "Create a follow-up task. customerId must be the id field from search_customer. dueDate accepts natural language (e.g. 'Thursday').",
    parameters: {
      type: "object",
      properties: {
        customerId: {
          type: "string",
          description: "The id field from search_customer results. Not the customer's name.",
        },
        title: { type: "string" },
        dueDate: { type: "string" },
        priority: { type: "string", enum: ["low", "med", "high"] },
      },
      required: ["customerId", "title"],
    },
  },
  {
    type: "function",
    name: "create_customer",
    description:
      "Create a new customer/contact record. Use when the rep mentions a person not yet in the system.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Full name of the customer." },
        company: { type: "string", description: "Company or organization name." },
        email: { type: "string" },
        phone: { type: "string" },
        stage: { type: "string", enum: ["Discovery", "Qualification", "Proposal", "Negotiation", "Closed Won", "Closed Lost"] },
        notes: { type: "string", description: "Any initial context about this customer." },
      },
      required: ["name", "company"],
    },
  },
  {
    type: "function",
    name: "save_call_context",
    description:
      "Save a call transcript or context notes against a customer. customerId must be the id from search_customer.",
    parameters: {
      type: "object",
      properties: {
        customerId: { type: "string", description: "The id field from search_customer results." },
        title: { type: "string", description: "Short title for this call, e.g. 'Discovery call – May 24'." },
        transcript: { type: "string", description: "The full transcript or meeting notes." },
        participants: { type: "string" },
        callDate: { type: "string" },
      },
      required: ["customerId", "transcript"],
    },
  },
  {
    type: "function",
    name: "get_call_context",
    description:
      "Retrieve saved call transcripts for a customer. Always call this before answering questions like 'summarize our last call' or 'what did they say about X'. customerId must be the id from search_customer.",
    parameters: {
      type: "object",
      properties: {
        customerId: { type: "string", description: "The id field from search_customer results." },
      },
      required: ["customerId"],
    },
  },
];

export class RealtimeSession {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private micStream: MediaStream | null = null;
  private cb: RealtimeCallbacks;
  private instructions: string;
  private model = "gpt-realtime-2";
  private audioCtx: AudioContext | null = null;
  private levelRAF: number | null = null;
  private currentResponseHasAudio = false;
  private currentResponseTextSent = false;
  private remoteAudioProgressed = false;
  private audioDoneTimer: number | null = null;

  /**
   * True only after the remote <audio> element emits playback/progress events.
   * A resolved play() promise alone is not enough to prove audible output.
   */
  private realtimeAudioPlayable = false;

  constructor(cb: RealtimeCallbacks, instructions: string) {
    this.cb = cb;
    this.instructions = instructions;
  }

  /** Whether the remote audio track is confirmed playing in this session. */
  get audioPlayable(): boolean {
    return this.realtimeAudioPlayable;
  }

  /** Sample mic amplitude (RMS) on a rAF loop and report it for the orb. */
  private startLevelMeter(stream: MediaStream) {
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      this.audioCtx = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        this.cb.onLevel?.(Math.min(1, rms * 3.2));
        this.levelRAF = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      /* level meter is best-effort */
    }
  }

  private getAudioEl(): HTMLAudioElement | null {
    return document.getElementById("briefly-agent-audio") as HTMLAudioElement | null;
  }

  private tryPlayAudio() {
    const el = this.getAudioEl();
    if (!el?.srcObject) return;
    el.muted = false;
    el.volume = 1;
    el.play().catch((err: unknown) => {
      console.warn("[Briefly] WebRTC audio play() blocked:", err);
      this.realtimeAudioPlayable = false;
    });
  }

  async connect(): Promise<void> {
    this.cb.onStatus?.("connecting");

    const tokenRes = await fetch("/api/realtime/session", { method: "POST" });
    if (!tokenRes.ok) {
      const detail = await tokenRes.json().catch(() => ({}));
      throw new Error(detail.error || "no realtime token");
    }
    const { client_secret, model } = (await tokenRes.json()) as {
      client_secret: { value: string };
      model: string;
    };
    this.model = model;

    const pc = new RTCPeerConnection();
    this.pc = pc;
    pc.addTransceiver("audio", { direction: "sendrecv" });

    // Receive the agent's voice on a hidden <audio> element.
    // playsInline prevents full-screen on iOS. We call play() explicitly here
    // inside the ontrack callback (still within the getUserMedia activation
    // context) for maximum autoplay compatibility.
    pc.ontrack = (e) => {
      const el = this.getAudioEl();
      if (!el) return;
      el.autoplay = true;
      el.setAttribute("playsinline", "true");
      const markPlayable = () => {
        this.realtimeAudioPlayable = true;
        this.remoteAudioProgressed = true;
      };
      el.onplaying = markPlayable;
      el.ontimeupdate = markPlayable;
      el.srcObject = e.streams[0];
      this.tryPlayAudio();
    };

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
    } catch {
      this.cb.onStatus?.("error");
      pc.close();
      this.pc = null;
      throw new Error("mic-denied");
    }
    for (const track of this.micStream.getAudioTracks()) {
      pc.addTrack(track, this.micStream);
    }
    this.startLevelMeter(this.micStream);

    this.dc = pc.createDataChannel("oai-events");
    this.dc.onopen = () => {
      this.configureSession();
      this.cb.onStatus?.("connected");
    };
    this.dc.onmessage = (e) => this.handleEvent(JSON.parse(e.data));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpRes = await fetch(
      `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model)}`,
      {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${client_secret.value}`,
          "Content-Type": "application/sdp",
        },
      }
    );
    if (!sdpRes.ok) {
      this.cb.onStatus?.("error");
      throw new Error("SDP exchange failed");
    }
    await pc.setRemoteDescription({
      type: "answer",
      sdp: await sdpRes.text(),
    });
  }

  private send(obj: unknown) {
    if (this.dc?.readyState === "open") this.dc.send(JSON.stringify(obj));
  }

  private configureSession() {
    // The current Realtime session schema requires type/model on session.update.
    this.send({
      type: "session.update",
      session: {
        type: "realtime",
        model: this.model,
        output_modalities: ["audio"],
        instructions: this.instructions,
        audio: {
          input: {
            transcription: { model: "whisper-1" },
            turn_detection: { type: "server_vad", create_response: true },
          },
          output: {
            voice: "marin",
          },
        },
        tools: TOOLS,
        tool_choice: "auto",
      },
    });
  }

  /** Send a typed message (text fallback) and ask for a spoken reply. */
  askText(text: string) {
    this.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    });
    this.send({ type: "response.create", response: RESPONSE_OPTS });
  }

  /** Inject a system context note without triggering a new response (used for customer switching). */
  injectContext(text: string) {
    this.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "system",
        content: [{ type: "input_text", text }],
      },
    });
  }

  /** Inject a system message mid-session and ask for a spoken reply. */
  injectSystem(text: string) {
    this.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "system",
        content: [{ type: "input_text", text }],
      },
    });
    this.send({ type: "response.create", response: RESPONSE_OPTS });
  }

  private async handleEvent(evt: {
    type: string;
    transcript?: string;
    name?: string;
    arguments?: string;
    call_id?: string;
    error?: { message?: string; code?: string; type?: string };
    response?: unknown;
  }) {
    switch (evt.type) {
      case "input_audio_buffer.speech_started":
        this.cb.onActivity?.("listening");
        break;
      case "input_audio_buffer.speech_stopped":
        this.cb.onActivity?.("transcribing");
        break;
      case "response.created":
        this.currentResponseHasAudio = false;
        this.currentResponseTextSent = false;
        this.remoteAudioProgressed = false;
        if (this.audioDoneTimer) {
          window.clearTimeout(this.audioDoneTimer);
          this.audioDoneTimer = null;
        }
        this.cb.onActivity?.("responding");
        break;

      // Both event name variants — older and newer Realtime API formats.
      case "response.audio.delta":
      case "response.output_audio.delta":
        this.currentResponseHasAudio = true;
        this.cb.onActivity?.("speaking");
        // Re-attempt play() on every first audio chunk in case the initial
        // ontrack play() was blocked and a later user gesture now allows it.
        if (!this.realtimeAudioPlayable) {
          this.tryPlayAudio();
        }
        break;

      case "response.done":
        if (!this.currentResponseTextSent) {
          const text = textFromResponseDone(evt.response);
          if (text) {
            this.currentResponseTextSent = true;
            const hasAudio = this.currentResponseHasAudio && this.remoteAudioProgressed;
            this.cb.onAgentText?.(text, hasAudio);
          }
        }
        if (this.currentResponseHasAudio && this.remoteAudioProgressed) {
          // Give the client-side audio buffer ~600 ms to drain before signalling done.
          this.audioDoneTimer = window.setTimeout(() => {
            this.audioDoneTimer = null;
            this.cb.onActivity?.("idle");
            this.cb.onAudioDone?.();
          }, 600);
        } else {
          this.cb.onActivity?.("idle");
        }
        break;

      case "conversation.item.input_audio_transcription.completed":
        if (evt.transcript) this.cb.onTranscript?.(evt.transcript);
        break;

      // Both transcript event name variants.
      case "response.audio_transcript.done":
      case "response.output_audio_transcript.done":
        if (evt.transcript) {
          // hasAudio=true only when BOTH the server sent audio chunks AND the
          // browser audio element confirmed playback started. If either is missing,
          // the caller should fall back to browser TTS.
          const hasAudio = this.currentResponseHasAudio && this.remoteAudioProgressed;
          this.currentResponseTextSent = true;
          this.cb.onAgentText?.(evt.transcript, hasAudio);
        }
        break;

      case "error": {
        const msg =
          evt.error?.message || evt.error?.code || "Realtime error";
        this.cb.onServerError?.(msg);
        this.cb.onActivity?.("idle");
        break;
      }

      case "response.function_call_arguments.done": {
        const name = evt.name as RealtimeToolName;
        const args = evt.arguments
          ? (JSON.parse(evt.arguments) as Record<string, unknown>)
          : {};
        this.cb.onActivity?.("tool_running");
        const result = (await this.cb.onTool?.(name, args)) ?? {};
        this.send({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: evt.call_id,
            output: JSON.stringify(result),
          },
        });
        this.cb.onActivity?.("responding");
        // Explicitly request audio for the post-tool spoken summary.
        this.send({ type: "response.create", response: RESPONSE_OPTS });
        break;
      }
    }
  }

  setMicMuted(muted: boolean) {
    this.micStream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }

  /** Barge-in: stop the agent's current spoken response so the rep can talk. */
  interrupt() {
    this.send({ type: "response.cancel" });
    const el = this.getAudioEl();
    if (el) {
      el.pause();
      el.currentTime = el.duration || 0;
      // Mark as not playable so the next response.audio.delta re-attempts play().
      this.realtimeAudioPlayable = false;
    }
  }

  close() {
    if (this.levelRAF) cancelAnimationFrame(this.levelRAF);
    this.levelRAF = null;
    if (this.audioDoneTimer) {
      window.clearTimeout(this.audioDoneTimer);
      this.audioDoneTimer = null;
    }
    this.audioCtx?.close().catch(() => {});
    this.audioCtx = null;
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.dc?.close();
    this.pc?.close();
    this.pc = null;
    this.dc = null;
    this.realtimeAudioPlayable = false;
    this.remoteAudioProgressed = false;
    this.cb.onLevel?.(0);
    this.cb.onStatus?.("closed");
  }
}
