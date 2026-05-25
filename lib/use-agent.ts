"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  makeAgentAction,
  makeAgentTurn,
  useAgentStore,
  type VoiceMode,
} from "./agent-store";
import { RealtimeSession, type RealtimeToolName } from "./realtime-client";
import { cleanQuery, interpret, type AgentIntent } from "./agent-brain";
import { api } from "./api";
import { ingestCallRecap } from "./call-recap-ingest";
import { shortDate } from "./format";
import type { CallContext, Customer, StructuredNote } from "./types";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function speakTTS(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) { resolve(); return; }
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text.trim());
    utt.rate = 1.05;
    // Prefer a female English voice when available.
    const voices = window.speechSynthesis.getVoices();
    const female = voices.find((v) =>
      /Samantha|Victoria|Karen|Moira|Fiona|Ava|Zira|Susan|Jenny|Emma/i.test(v.name) && v.lang.startsWith("en")
    ) ?? voices.find((v) => v.lang.startsWith("en-"));
    if (female) utt.voice = female;
    utt.onend = () => resolve();
    utt.onerror = () => resolve();
    window.speechSynthesis.speak(utt);
    // Safety timeout — ~75 ms per character, minimum 2 s
    setTimeout(resolve, Math.max(2000, text.length * 75));
  });
}

const FINAL_FALLBACK_DELAY = 4500;

const FILLER_RE = /^(okay|ok|sure|yeah|yes|got it|gotcha|one sec|just a sec|give me a second|checking|checking now|working on it|let me (pull|check|look|grab|find)( that| this| it| up| for you)?|i'?ll (pull|check|look|grab|find)( that| this| it| up| for you)?)[\s.!-]*$/i;

function isFillerResponse(text: string) {
  return FILLER_RE.test(text.trim());
}

function conciseCustomerSummary(
  customer: Customer | null,
  history: {
    notes?: { headline: string; body?: string }[];
    tasks?: { done: boolean; title: string; dueDate?: string }[];
  },
  contexts: CallContext[] = []
) {
  const notes = history.notes ?? [];
  const openTasks = (history.tasks ?? []).filter((task) => !task.done);
  const parts: string[] = [];

  if (customer) {
    parts.push(`${customer.name} is at ${customer.company}, currently in ${customer.stage}.`);
  }
  if (notes[0]) {
    const detail = notes[0].body
      ? ` ${notes[0].body.split(/(?<=[.?!])\s/)[0]}`
      : "";
    parts.push(`Latest note: ${notes[0].headline}.${detail}`);
  }
  if (openTasks[0]) {
    parts.push(
      `Open follow-up: ${openTasks[0].title}${openTasks[0].dueDate ? ` by ${shortDate(openTasks[0].dueDate)}` : ""}.`
    );
  }
  if (!notes[0] && !openTasks[0] && contexts.length === 0) {
    parts.push("No saved notes, open follow-ups, or call transcripts yet.");
  }

  return parts.join(" ");
}

function finalResponseForTool(
  name: RealtimeToolName,
  result: unknown,
  args: Record<string, unknown>
) {
  if (result && typeof result === "object" && "error" in result) {
    return "I couldn't complete that tool call. Try again or pick the customer context manually.";
  }

  if (name === "search_customer") {
    const ranked = (result as { ranked?: { name: string; company: string; confidence: number }[] }).ranked ?? [];
    const best = ranked[0];
    return best
      ? `I found ${best.name} at ${best.company}.`
      : `I couldn't find a matching customer for "${String(args.query ?? "that")}".`;
  }

  if (name === "get_customer_history") {
    const history = result as {
      notes?: { headline: string; body?: string }[];
      tasks?: { done: boolean; title: string; dueDate?: string }[];
    };
    return conciseCustomerSummary(null, history);
  }

  if (name === "get_call_context") {
    const contexts = Array.isArray(result) ? (result as CallContext[]) : [];
    if (!contexts.length) return "I don't have a saved call transcript for this customer yet.";
    return `I found ${contexts.length} saved call transcript${contexts.length === 1 ? "" : "s"}. The latest is "${contexts[0].title}".`;
  }

  if (name === "save_note") {
    const note = result as { headline?: string };
    return `Saved the note${note.headline ? `: "${note.headline}"` : ""}.`;
  }

  if (name === "create_task") {
    const task = result as { title?: string; dueDate?: string };
    return task.dueDate
      ? `Done — I created "${task.title ?? "that follow-up"}" for ${shortDate(task.dueDate)}.`
      : `Done — I created "${task.title ?? "that follow-up"}".`;
  }

  if (name === "create_customer") {
    const customer = result as { name?: string; company?: string };
    return `Done — ${customer.name ?? String(args.name ?? "that customer")} is now in your customer list.`;
  }

  if (name === "save_call_context") {
    const context = result as { title?: string };
    return `Saved the transcript${context.title ? ` as "${context.title}"` : ""}.`;
  }

  return "Done.";
}

const POST_CALL_COMMANDS = new Set([
  "generate post-call notes",
  "call recap",
  "post-call notes",
  "import transcript",
  "dictate recap",
  "create follow-up",
]);

function postCallConversationSource() {
  return useAgentStore
    .getState()
    .transcript.filter((turn) => turn.role === "user" || turn.speaker === "rep")
    .map((turn) => (turn.content ?? turn.text).trim())
    .filter((text) => text.length > 20 && !POST_CALL_COMMANDS.has(text.toLowerCase()))
    .join("\n\n");
}

function buildInstructions(customer: Customer | null, callContexts: CallContext[]): string {
  const ctx = customer
    ? `Selected customer: ${customer.name} at ${customer.company} (stage: ${customer.stage}).` +
      (customer.notes[0] ? ` Last note: "${customer.notes[0].headline}". Body: "${customer.notes[0].body}".` : " No notes yet.") +
      (customer.tasks.filter(t => !t.done).length > 0
        ? ` Open tasks: ${customer.tasks.filter(t => !t.done).map(t => t.title + (t.dueDate ? ` (due ${t.dueDate})` : "")).join("; ")}.`
        : " No open tasks.")
    : "No customer selected yet.";

  const transcriptCtx = callContexts.length > 0
    ? `This customer has ${callContexts.length} saved call transcript(s). The most recent is titled "${callContexts[0].title}"${callContexts[0].callDate ? ` from ${callContexts[0].callDate}` : ""}. Use get_call_context to retrieve the full transcript before answering questions about past calls.`
    : "No call transcripts saved for this customer yet.";

  return `You are Briefly, a voice-first sales co-pilot for a sales representative.

Your job is to help the rep during or after a sales call. You can:
1. Answer questions about the selected customer and call context.
2. Summarize imported call transcripts.
3. Capture structured notes.
4. Create follow-up tasks.
5. Search or create customer records.

You are NOT a generic chatbot. Keep responses short, spoken, and useful in a live sales workflow.

## Grounding rules
- For any customer-specific question, use the available tools/context BEFORE answering.
- Use the selected customer profile, saved notes, open tasks, and imported call transcripts.
- If the rep asks about a customer or call and no transcript/context exists, say you don't have enough call context yet and offer to import or capture it.
- NEVER invent call details, objections, pricing, sentiment, or next steps.
- If context is ambiguous, ask ONE brief clarifying question.

## Tool behavior
- CRITICAL: Never pass a customer's name as customerId. customerId is always an opaque id string (like "cus_abc123") returned by search_customer. If you don't have the id yet, call search_customer first.
- Use search_customer when the rep mentions a customer not currently selected.
- Use create_customer when the rep asks to add a new customer or contact not in the system.
- Use get_customer_history AND get_call_context before answering questions about past calls or customer background.
- Use save_note when the rep says things like "save a note", "remember that", or "capture this".
- Use create_task when the rep asks for a reminder, follow-up, next step, or scheduled action.
- Use save_call_context when the rep imports or provides a transcript.
- After a tool call succeeds, summarize what you found in one or two sentences. Do not re-read raw JSON.

## Response to missing context
- If asked to summarize a call and no transcripts exist: say "I don't have a call transcript for [customer] yet. You can paste one in using the Import Call Transcript button, or I can summarize the saved notes."
- If the customer doesn't exist: say "I don't see [name] in the customer list. Want me to create that customer?"
- If asked about details not in the data: say "I don't have that information yet" — never invent it.

## Voice behavior
- Speak naturally and briefly. Two sentences maximum unless the rep asks for detail.
- Confirm completed actions: "Done — I created that follow-up for Thursday."
- During live calls, prioritize low-latency, actionable help.
- After calls, help summarize, structure notes, and extract follow-ups.

## Correction behavior
- If a transcript turn is edited, treat the corrected text as the source of truth.
- If a prior tool call was based on incorrect transcription, mark the old action as superseded and re-run the corrected action.

Tools: search_customer(query), get_customer_history(customerId), save_note(customerId, rawText), create_task(customerId, title, dueDate, priority), create_customer(name, company, email?, phone?, stage?, notes?), save_call_context(customerId, transcript, title?), get_call_context(customerId).

Customer context for this session: ${ctx}
${transcriptCtx}`;
}

type SpeechRec = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  }
}

async function canAccessMic(): Promise<boolean> {
  if (typeof window === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return false;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}

export function useAgent(sessionId: string) {
  const sessionRef = useRef<RealtimeSession | null>(null);
  const speechRef = useRef<SpeechRec | null>(null);
  const pttShouldSendRef = useRef(false);
  const pttRealtimeMuteTimerRef = useRef<number | null>(null);
  const realtimeFallbackTimerRef = useRef<number | null>(null);
  const realtimeFinalAnswerRef = useRef(false);
  const resumeHandsFreeRef = useRef<() => void>(() => {});
  const sendRepRef = useRef<(text: string) => void>(() => {});
  const dealBriefRef = useRef<() => void>(() => {});
  const status = useAgentStore((s) => s.status);
  const qc = useQueryClient();

  useEffect(() => {
    useAgentStore.getState().init(sessionId);
  }, [sessionId]);

  const clearRealtimeFallback = useCallback(() => {
    if (realtimeFallbackTimerRef.current) {
      window.clearTimeout(realtimeFallbackTimerRef.current);
      realtimeFallbackTimerRef.current = null;
    }
  }, []);

  const runTool = useCallback(
    async (
      name: RealtimeToolName,
      args: Record<string, unknown>,
      triggerTurnId?: string
    ): Promise<{ id: string; result: unknown }> => {
      const store = useAgentStore.getState();
      const action = makeAgentAction(name, args, triggerTurnId);
      store.setActivity("tool_running");
      store.addAction(action);
      try {
        let result: unknown = {};
        if (name === "search_customer") {
          result = await api.searchCustomerFuzzy(String(args.query ?? ""));
        } else if (name === "get_customer_history") {
          result = await api.getCustomerHistory(String(args.customerId));
        } else if (name === "save_note") {
          result = await api.saveNote(
            args as Parameters<typeof api.saveNote>[0]
          );
          const customerId = String(args.customerId ?? "");
          if (customerId) {
            void qc.invalidateQueries({ queryKey: ["customer", customerId] });
            void qc.invalidateQueries({ queryKey: ["customers"] });
          }
        } else if (name === "create_task") {
          result = await api.createTask({
            customerId: String(args.customerId),
            title: String(args.title),
            dueDate: args.dueDate ? String(args.dueDate) : undefined,
            priority:
              (args.priority as "low" | "med" | "high" | undefined) ?? "med",
          });
          const customerId = String(args.customerId ?? "");
          if (customerId) {
            void qc.invalidateQueries({ queryKey: ["customer", customerId] });
            void qc.invalidateQueries({ queryKey: ["customers"] });
          }
        } else if (name === "create_customer") {
          result = await api.createCustomer({
            name: String(args.name),
            company: String(args.company),
            email: args.email ? String(args.email) : undefined,
            phone: args.phone ? String(args.phone) : undefined,
            stage: args.stage ? String(args.stage) : undefined,
            notes: args.notes ? String(args.notes) : undefined,
          });
          // Auto-select the new customer and refresh the customer list
          const newCustomer = (result as { id: string });
          store.setSelectedCustomer(newCustomer.id);
          void qc.invalidateQueries({ queryKey: ["customers"] });
        } else if (name === "save_call_context") {
          result = await api.importCallContext({
            customerId: String(args.customerId),
            transcript: String(args.transcript),
            title: args.title ? String(args.title) : undefined,
            participants: args.participants ? String(args.participants) : undefined,
            callDate: args.callDate ? String(args.callDate) : undefined,
          });
          const customerId = String(args.customerId ?? "");
          if (customerId) {
            void qc.invalidateQueries({ queryKey: ["callContexts", customerId] });
            void qc.invalidateQueries({ queryKey: ["customer", customerId] });
            void qc.invalidateQueries({ queryKey: ["customers"] });
          }
        } else if (name === "get_call_context") {
          result = await api.getCallContexts(String(args.customerId));
        }
        store.updateAction(action.id, { status: "success", result });
        return { id: action.id, result };
      } catch (err) {
        store.updateAction(action.id, {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
        return { id: action.id, result: { error: true } };
      }
    },
    [qc]
  );

  const sayAgent = useCallback(async (text: string, gap = 320) => {
    const store = useAgentStore.getState();
    if (isFillerResponse(text)) {
      store.setActivity("thinking");
      await wait(Math.min(gap, 160));
      return;
    }

    store.setActivity("responding");
    await wait(gap);
    store.setActivity("speaking");
    store.addAgentTurn(text);

    // Only use browser TTS in simulation mode. When Realtime is active the
    // WebRTC audio track is the sole output; calling speakTTS would double-voice.
    const voiceActive =
      store.mode !== "realtime" &&
      store.status === "live" &&
      (store.handsFree || store.voiceMode === "ptt");
    if (voiceActive) {
      await speakTTS(text);
    } else {
      await wait(Math.min(1500, 380 + text.length * 16));
    }

    store.setActivity("idle");
    resumeHandsFreeRef.current();
  }, []);

  const resolveCustomer = useCallback(
    async (name?: string, fallback?: string): Promise<string | null> => {
      const sel = useAgentStore.getState().selectedCustomerId;

      // If the user explicitly named someone, search for that person first.
      // Never silently return the selected customer when a different name was given.
      if (name?.trim()) {
        const { result } = await runTool("search_customer", { query: name });
        const ranked = (result as { ranked?: { id: string; confidence: number }[] }).ranked;
        if (ranked && ranked[0] && ranked[0].confidence >= 0.35) {
          return ranked[0].id;
        }
        // Named customer not found — do not fall back to selected customer.
        return null;
      }

      // No explicit name — use the already-selected customer.
      if (sel) return sel;

      // No selection either — try extracting a name from raw text as a last resort.
      const query = fallback ? cleanQuery(fallback) : "";
      if (!query.trim()) return null;
      const { result } = await runTool("search_customer", { query });
      const ranked = (result as { ranked?: { id: string; confidence: number }[] }).ranked;
      if (ranked && ranked[0] && ranked[0].confidence >= 0.35) {
        useAgentStore.getState().setSelectedCustomer(ranked[0].id);
        return ranked[0].id;
      }
      return null;
    },
    [runTool]
  );

  const handleIntent = useCallback(
    async (intent: AgentIntent, repTurnId: string, rawText = "") => {
      const store = useAgentStore.getState();
      if (
        store.postCallDraft &&
        /\b(save this|save note|save the note|save post-call notes?|add (it|this) to notes)\b/i.test(rawText)
      ) {
        const customerId = await resolveCustomer();
        if (!customerId) {
          await sayAgent("Pick a customer in the context chip before saving.");
          return;
        }
        await runTool(
          "save_note",
          { customerId, structuredNote: store.postCallDraft, source: "call" },
          repTurnId
        );
        store.setPostCallDraft(null);
        await sayAgent("Saved — I added the post-call note to Notes.");
        return;
      }

      if (intent.kind === "end") {
        await sayAgent("Okay — I'm here when you need me.");
        return;
      }
      if (intent.kind === "chat") {
        await sayAgent(intent.reply);
        return;
      }

      if (intent.kind === "create_customer") {
        const { result } = await runTool("create_customer", {
          name: intent.name,
          company: intent.company,
          notes: intent.notes,
        }, repTurnId);
        const c = result as { name: string };
        await sayAgent(`Done — ${c?.name ?? intent.name} is now in your customer list and selected as context.`);
        return;
      }

      if (intent.kind === "lookup") {
        const customerId = await resolveCustomer(intent.name, rawText);
        if (!customerId) {
          const name = intent.name ?? cleanQuery(rawText);
          await sayAgent(`I don't see ${name || "that customer"} in the list. Want me to create a new customer record?`);
          return;
        }
        const [{ result: histResult }, { result: ctxResult }, customer] =
          await Promise.all([
            runTool("get_customer_history", { customerId }),
            runTool("get_call_context", { customerId }),
            api.getCustomer(customerId).catch(() => null),
          ]);
        const hist = histResult as {
          notes?: { headline: string; body?: string }[];
          tasks?: { done: boolean; title: string; dueDate?: string }[];
        };
        const contexts = ctxResult as CallContext[];
        await sayAgent(conciseCustomerSummary(customer, hist, contexts));
        return;
      }

      if (intent.kind === "summarize_call") {
        const customerId = await resolveCustomer(intent.name, rawText);
        if (!customerId) {
          await sayAgent(
            intent.name
              ? `I don't see ${intent.name} in the customer list. Want me to create a new record?`
              : "Which customer should I summarize? Tell me their name."
          );
          return;
        }
        const [{ result: ctxResult }, { result: histResult }] = await Promise.all([
          runTool("get_call_context", { customerId }),
          runTool("get_customer_history", { customerId }),
        ]);
        const contexts = ctxResult as CallContext[];
        const hist = histResult as { notes?: { headline: string; body?: string }[]; tasks?: { done: boolean; title: string }[] };

        if (Array.isArray(contexts) && contexts.length > 0) {
          const latest = contexts[0];
          const snippet = latest.transcript.slice(0, 280);
          await sayAgent(
            `Last call: "${latest.title}". Opening: "${snippet.trim()}…" Want me to save a note or create a follow-up from this?`
          );
          return;
        }

        // No transcript — fall back to notes
        const notes = hist.notes ?? [];
        if (notes.length > 0) {
          const open = (hist.tasks ?? []).filter((t) => !t.done).length;
          await sayAgent(
            `No call transcript saved yet, but here's what I have: "${notes[0].headline}".${notes[0].body ? ` ${notes[0].body.slice(0, 100)}.` : ""} ${open > 0 ? `There are also ${open} open task${open === 1 ? "" : "s"}.` : ""} Import a transcript for a full call summary.`
          );
          return;
        }

        await sayAgent("No call transcripts or notes saved yet. Use the Import Transcript button to paste one, then I can summarize it.");
        return;
      }

      if (intent.kind === "note") {
        const customerId = await resolveCustomer(intent.name, rawText);
        if (!customerId) {
          await sayAgent(
            intent.name
              ? `I don't see ${intent.name} in the customer list. Want me to create a new record?`
              : "Who's this note for? Tell me the customer."
          );
          return;
        }
        let noteText = intent.text;
        if (intent.raw || !noteText) {
          noteText = store.transcript
            .filter((t) => t.role === "user" || t.speaker === "rep")
            .slice(-3)
            .map((t) => t.content ?? t.text)
            .join(" ");
        }
        const { result } = await runTool("save_note", { customerId, rawText: noteText }, repTurnId);
        await sayAgent(finalResponseForTool("save_note", result, { rawText: noteText }));
        return;
      }

      if (intent.kind === "task") {
        const customerId = await resolveCustomer(intent.name, rawText);
        if (!customerId) {
          await sayAgent(
            intent.name
              ? `I don't see ${intent.name} in the customer list. Want me to create a new record?`
              : "Who should I set that reminder for?"
          );
          return;
        }
        const { result } = await runTool(
          "create_task",
          { customerId, title: intent.title, dueDate: intent.dateText, priority: "med" },
          repTurnId
        );
        await sayAgent(finalResponseForTool("create_task", result, { title: intent.title }));
        return;
      }
    },
    [resolveCustomer, runTool, sayAgent]
  );

  /**
   * Talking points — turn customer context + transcripts + notes/tasks into a
   * one-screen pre-call prep card, shown in the center workspace. Runs the
   * context tools (visible in the action feed) before generating.
   */
  const dealBrief = useCallback(async () => {
    const store = useAgentStore.getState();
    store.setBriefLoading(true);
    store.setActivity("thinking");

    try {
      const customerId = await resolveCustomer();
      if (!customerId) {
        toast.message("Pick a customer first", {
          description: "Choose who to brief in the context chip.",
        });
        await sayAgent("Who should I brief you on? Pick a customer up top.");
        return;
      }

      store.setCenterView("transcript");
      await Promise.all([
        runTool("get_customer_history", { customerId }),
        runTool("get_call_context", { customerId }),
      ]);

      const res = await api.generateBrief(customerId);
      if ("insufficientContext" in res) {
        store.setCenterView("transcript");
        store.setBriefNeedsContext(true);
        await sayAgent(
          "No call context yet — use the suggestions below the button to add some first."
        );
        return;
      }
      store.setBriefNeedsContext(false);
      store.setDealBrief(res);
      await sayAgent(`Here's your brief on ${res.customerName}. ${res.recommendedNextStep}`);
    } catch {
      store.setBriefLoading(false);
      store.setCenterView("transcript");
      toast.error("Couldn't generate the brief");
    } finally {
      const latest = useAgentStore.getState();
      latest.setBriefLoading(false);
      latest.setActivity("idle");
    }
  }, [resolveCustomer, runTool, sayAgent]);
  useEffect(() => { dealBriefRef.current = dealBrief; }, [dealBrief]);

  /** Create a follow-up task directly from suggested next steps. */
  const createFollowUp = useCallback(
    async (title: string) => {
      const customerId = await resolveCustomer();
      if (!customerId) {
        toast.error("Pick a customer first.");
        return;
      }
      await runTool("create_task", { customerId, title, priority: "med" });
      useAgentStore.getState().setActivity("idle");
      toast.success("Follow-up created");
    },
    [resolveCustomer, runTool]
  );

  /** Barge-in: stop the agent mid-sentence so the rep can take over. */
  const interrupt = useCallback(() => {
    const store = useAgentStore.getState();
    // Stop realtime WebRTC audio + cancel the server response
    if (sessionRef.current && store.mode === "realtime") {
      sessionRef.current.interrupt();
    }
    // Stop browser TTS (simulation mode or text-only fallback)
    if (typeof window !== "undefined") {
      window.speechSynthesis?.cancel();
      const el = document.getElementById("briefly-agent-audio") as HTMLAudioElement | null;
      if (el) { el.pause(); el.currentTime = el.duration || 0; }
    }
    store.setActivity("idle");
    // In hands-free mode, resume listening immediately after interruption
    resumeHandsFreeRef.current();
  }, []);

  /** A short faux amplitude burst so the orb feels alive on a demo-mode send. */
  const demoPulse = useCallback(() => {
    let v = 0.75;
    useAgentStore.getState().setMicLevel(v);
    const id = window.setInterval(() => {
      v *= 0.8;
      if (v < 0.04) {
        window.clearInterval(id);
        useAgentStore.getState().setMicLevel(0);
      } else {
        useAgentStore.getState().setMicLevel(v);
      }
    }, 60);
  }, []);

  const sendRep = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const store = useAgentStore.getState();
      const turn = store.addUserTurn(trimmed);
      realtimeFinalAnswerRef.current = false;
      store.setActivity("thinking");

      // In hands-free mode, stop recognition for the whole agent turn. It
      // resumes only after the final assistant response finishes.
      if (store.handsFree) {
        speechRef.current?.abort();
        speechRef.current = null;
      }

      const intent = interpret(trimmed);
      if (intent.kind === "deal_brief") {
        void dealBriefRef.current();
        return;
      }

      if (sessionRef.current && store.mode === "realtime") {
        // If the user named a specific customer, resolve them and inject context
        // so the Realtime agent uses the right customer data, not the selected one.
        const intentName = "name" in intent ? intent.name : undefined;
        if (intentName) {
          const fuzzyResult = await api.searchCustomerFuzzy(intentName).catch(() => null);
          const best = fuzzyResult?.ranked?.[0];
          if (best && best.confidence >= 0.35) {
            const customer = await api.getCustomer(best.id).catch(() => null);
            if (customer) {
              sessionRef.current.injectContext(
                `Context: The rep is asking about ${customer.name} at ${customer.company} ` +
                `(customerId: ${customer.id}, stage: ${customer.stage}). ` +
                `Answer about this customer — not the previously selected one. ` +
                `Call get_customer_history and get_call_context with customerId "${customer.id}".`
              );
            }
          }
        }
        sessionRef.current.askText(trimmed);
        return;
      }
      demoPulse();
      await handleIntent(intent, turn.id, trimmed);
    },
    [handleIntent, demoPulse]
  );
  useEffect(() => {
    sendRepRef.current = sendRep;
  }, [sendRep]);

  /**
   * Hands-free speech recognition: interim results stream into the command bar
   * text box in real-time. After each natural pause (utterance end), the browser
   * session closes and a fresh one starts automatically so the box is ready for
   * the next command without accumulating old text. The user reviews and hits
   * Send — just like PTT but without holding the button.
   */
  const startHandsFreeRecognition = useCallback(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return null;

    function makeRec(): SpeechRec | null {
      const rec = new SR!();
      rec.continuous = false; // one utterance per session → clean restarts
      rec.interimResults = true;
      rec.lang = "en-US";
      rec.onresult = (e) => {
        // Recap dictation owns the mic — don't touch the chat input draft.
        if (useAgentStore.getState().activeCaptureMode === "recap") return;
        let out = "";
        for (let i = 0; i < e.results.length; i++) {
          out += e.results[i][0].transcript;
        }
        useAgentStore.getState().setInputDraft(out.replace(/\s+/g, " ").trimStart());
      };
      rec.onend = () => {
        const store = useAgentStore.getState();
        // If recap dictation stole the mic, discard this utterance entirely.
        if (store.activeCaptureMode === "recap") {
          speechRef.current = null;
          return;
        }
        const finalText = store.inputDraft.trim();
        if (finalText) {
          store.setInputDraft("");
          speechRef.current = null;
          void sendRepRef.current(finalText);
          return;
        }

        const readyToListen =
          store.handsFree &&
          store.status === "live" &&
          (store.activity === "listening" || store.activity === "idle");

        if (readyToListen) {
          const next = makeRec();
          if (next) speechRef.current = next;
        } else {
          speechRef.current = null;
          if (store.status !== "live") store.setActivity("idle");
        }
      };
      rec.onerror = (e) => {
        if (e.error !== "no-speech" && e.error !== "aborted")
          toast.error(`Mic error: ${e.error}`);
      };
      try {
        rec.start();
        useAgentStore.getState().setActivity("listening");
        useAgentStore.getState().setError(null);
        return rec;
      } catch {
        return null;
      }
    }

    return makeRec();
  }, []);

  // Abort chat recognition when recap dictation starts; resume when it ends.
  const activeCaptureMode = useAgentStore((s) => s.activeCaptureMode);
  useEffect(() => {
    if (activeCaptureMode === "recap") {
      if (speechRef.current) {
        speechRef.current.abort();
        speechRef.current = null;
      }
    } else {
      // "recap" → null: attempt to resume hands-free chat after the recap rec closes.
      const timer = window.setTimeout(() => resumeHandsFreeRef.current(), 350);
      return () => window.clearTimeout(timer);
    }
  }, [activeCaptureMode]);

  useEffect(() => {
    resumeHandsFreeRef.current = () => {
      const store = useAgentStore.getState();
      if (
        !store.handsFree ||
        store.status !== "live" ||
        store.voiceMode !== "continuous" ||
        store.activeCaptureMode === "recap" ||
        speechRef.current
      ) {
        return;
      }

      if (store.mode === "realtime") {
        sessionRef.current?.setMicMuted(true);
      }

      speechRef.current = startHandsFreeRecognition();
      if (!speechRef.current) {
        toast.message("Browser speech not available — use the text box instead.");
      }
    };
  }, [startHandsFreeRecognition]);
  const startSimulation = useCallback(async () => {
    const store = useAgentStore.getState();
    const hasMic = await canAccessMic();
    if (hasMic) {
      store.setError(null);
    } else {
      store.setError("mic-blocked");
    }
    const wasMicBlocked = store.errorMsg === "mic-blocked";
    store.setMode("simulation");
    store.start();
    store.setActivity("idle");
    if (wasMicBlocked) {
      store.setVoiceMode("ptt");
    }
    const ptt = wasMicBlocked || store.voiceMode === "ptt";
    store.setHandsFree(!ptt);
    await sayAgent(
      ptt
        ? "Hey — hold the mic to talk (I'll fill the box so you can edit), or just type. I can look someone up, save a note, or set a follow-up."
        : "Hey — I'm listening. Ask me to look someone up, save a note, import a call transcript, or set a follow-up."
    );
    if (!ptt) {
      if (!speechRef.current) speechRef.current = startHandsFreeRecognition();
      if (!speechRef.current)
        toast.message("Browser speech not available — use the text box instead.");
    }
  }, [sayAgent, startHandsFreeRecognition]);
  const startRealtime = useCallback(
    async (customer: Customer | null) => {
      const store = useAgentStore.getState();

      if (sessionRef.current) {
        sessionRef.current.close();
        sessionRef.current = null;
      }
      if (speechRef.current) {
        speechRef.current.abort();
        speechRef.current = null;
      }

      store.setStatus("connecting");
      store.setError(null);

      // Fetch call contexts to enrich the system prompt
      let callContexts: CallContext[] = [];
      if (customer?.id) {
        callContexts = await api.getCallContexts(customer.id).catch(() => []);
      }

      const session = new RealtimeSession(
        {
          onStatus: (s) => {
            if (s === "error") toast.error("Realtime connection error");
          },
          onActivity: (a) => useAgentStore.getState().setActivity(a),
          onLevel: (lvl) => useAgentStore.getState().setMicLevel(lvl),
          onServerError: (m) =>
            toast.error("Voice error", { description: m }),
          onTranscript: (t) => {
            useAgentStore.getState().addUserTurn(t);
            if (interpret(t).kind === "deal_brief") void dealBriefRef.current();
          },
          onAgentText: (t, hasAudio) => {
            if (isFillerResponse(t)) return;
            clearRealtimeFallback();
            realtimeFinalAnswerRef.current = true;
            useAgentStore.getState().addAgentTurn(t);
            if (!hasAudio) {
              // hasAudio=false means either no audio from the server OR the browser
              // audio element failed to start (autoplay blocked). Fall back to TTS.
              window.setTimeout(() => {
                if (sessionRef.current?.audioPlayable) return;
                void speakTTS(t).then(() => {
                  useAgentStore.getState().setActivity("idle");
                  resumeHandsFreeRef.current();
                });
              }, 350);
            }
            // hasAudio=true: WebRTC audio is confirmed playing; onAudioDone handles resume.
          },
          onAudioDone: () => {
            clearRealtimeFallback();
            const store = useAgentStore.getState();
            store.setActivity("idle");
            resumeHandsFreeRef.current();
          },
          onTool: async (name, args) => {
            clearRealtimeFallback();
            const { result } = await runTool(name, args);
            const fallback = finalResponseForTool(name, result, args);
            realtimeFallbackTimerRef.current = window.setTimeout(() => {
              if (realtimeFinalAnswerRef.current) {
                realtimeFallbackTimerRef.current = null;
                return;
              }
              const store = useAgentStore.getState();
              store.setActivity("responding");
              store.addAgentTurn(fallback);
              // If Realtime didn't speak the tool result, use TTS as fallback.
              if (!sessionRef.current?.audioPlayable) {
                void speakTTS(fallback).then(() => {
                  useAgentStore.getState().setActivity("idle");
                  resumeHandsFreeRef.current();
                });
              } else {
                store.setActivity("idle");
                resumeHandsFreeRef.current();
              }
              realtimeFallbackTimerRef.current = null;
            }, FINAL_FALLBACK_DELAY);
            return result;
          },
        },
        buildInstructions(customer, callContexts)
      );
      try {
        await session.connect();
        sessionRef.current = session;
        store.setMode("realtime");
        store.start();
        const ptt = store.voiceMode === "ptt";
        store.setHandsFree(!ptt);
        session.setMicMuted(true);
        if (!ptt) {
          store.setActivity("listening");
          speechRef.current = startHandsFreeRecognition();
        }
        toast.success(
          ptt ? "Connected — hold the mic to talk" : "Connected — speak or type"
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.startsWith("mic:")) {
          const browserReason = msg.slice(4);
          useAgentStore.getState().setError("mic-blocked");
          
          let errorDesc = "Allow mic access in your browser, then tap to start again. Using demo mode for now.";
          if (typeof window !== "undefined" && !window.isSecureContext) {
            errorDesc = "Insecure context (HTTP) detected. Microphone access requires HTTPS or localhost. Using demo mode for now.";
          } else if (browserReason && !/NotAllowed|PermissionDenied|Security/i.test(browserReason)) {
            errorDesc = `The browser could not start the microphone (${browserReason}). Using demo mode for now.`;
          }
          
          toast.error("Microphone blocked", {
            description: errorDesc,
          });
          await startSimulation();
        } else {
          const detail = msg ? `: ${msg}` : "";
          toast.message("Voice unavailable — using text mode.", {
            description: `Realtime connection failed${detail}. Check that OPENAI_API_KEY is set.`,
          });
          await startSimulation();
        }
      }
    },
    [clearRealtimeFallback, runTool, startSimulation]
  );

  const rerunCorrection = useCallback(
    async (
      oldActionId: string,
      name: RealtimeToolName,
      correctedText: string,
      turnId: string
    ) => {
      const intent = interpret(correctedText);
      const customerId = await resolveCustomer(
        "name" in intent ? intent.name : undefined,
        correctedText
      );
      if (!customerId) return;

      await sayAgent("Let me fix that.");
      let newId = "";
      if (name === "create_task" && intent.kind === "task") {
        const { id, result } = await runTool(
          "create_task",
          { customerId, title: intent.title, dueDate: intent.dateText, priority: "med" },
          turnId
        );
        newId = id;
        const due = (result as { dueDate?: string }).dueDate;
        await sayAgent(
          due ? `Updated — reminder set for ${shortDate(due)}.` : "Updated."
        );
      } else if (name === "save_note" && intent.kind === "note") {
        const { id } = await runTool(
          "save_note",
          { customerId, rawText: intent.text },
          turnId
        );
        newId = id;
        await sayAgent("Updated the note.");
      }

      if (newId) {
        useAgentStore
          .getState()
          .updateAction(oldActionId, { superseded: true, supersededBy: newId });
      }
    },
    [resolveCustomer, runTool, sayAgent]
  );

  const editTurn = useCallback((id: string, newText: string) => {
    const store = useAgentStore.getState();
    const turn = store.transcript.find((t) => t.id === id);
    store.editTurn(id, newText);
    if (!turn || (turn.role !== "user" && turn.speaker !== "rep")) return;
    // No real change → nothing to re-do.
    if (newText.trim() === turn.originalText.trim()) return;

    const now = Date.now();
    const trigger = [...store.actions]
      .reverse()
      .find((a) => a.triggerTurnId === id && !a.superseded && now - a.at < 60_000);

    // Case 1: the edited turn drove a tool call → redo that tool.
    if (trigger) {
      toast.message(`Re-running ${trigger.name} with corrected input`);
      if (sessionRef.current && store.mode === "realtime") {
        sessionRef.current.injectSystem(
          `The rep corrected their earlier message. The corrected version is: "${newText}". Determine if any recent tool calls need to be redone and act accordingly.`
        );
        return;
      }
      void rerunCorrection(
        trigger.id,
        trigger.name as RealtimeToolName,
        newText,
        id
      );
      return;
    }

    // Case 2: no tool was triggered → re-prompt the agent with the correction
    // so its response reflects what the rep actually meant.
    toast.message("Re-asking with your correction");
    if (sessionRef.current && store.mode === "realtime") {
      sessionRef.current.injectSystem(
        `The rep corrected their previous message to: "${newText}". Respond to the corrected version.`
      );
      return;
    }
    void handleIntent(interpret(newText), id, newText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seedCorrectionDemo = useCallback(async () => {
    const store = useAgentStore.getState();
    if (!store.selectedCustomerId) {
      toast.error("Pick a customer first (the context chip up top).");
      return;
    }
    const turn = makeAgentTurn("rep", "Remind me to follow up on Tuesday.", 0.62);
    store.addTurn(turn);
    await handleIntent(interpret(turn.text), turn.id, turn.text);
    toast.message('Now edit “Tuesday” → “Thursday” on that turn', {
      description: "The agent re-runs the task with the correction.",
    });
  }, [handleIntent]);

  const toggleMic = useCallback(() => {
    const store = useAgentStore.getState();
    if (store.activeCaptureMode === "recap" || store.activeCaptureMode === "note") {
      return;
    }
    const next = !store.handsFree;
    store.setHandsFree(next);

    if (store.mode === "realtime") {
      sessionRef.current?.setMicMuted(true);
      store.setActivity(next ? "listening" : "idle");
    }

    if (next) {
      speechRef.current = startHandsFreeRecognition();
      if (!speechRef.current) {
        toast.message("Browser speech not available — use the text box instead.");
        store.setHandsFree(false);
        store.setActivity("idle");
      }
    } else {
      speechRef.current?.abort();
      speechRef.current = null;
      store.setActivity("idle");
    }
  }, [startHandsFreeRecognition]);

  /**
   * Push-to-talk: while held, stream interim speech into the command bar. On
   * release, finalize the current draft through the same path as typed input.
   */
  const pttStart = useCallback(() => {
    const store = useAgentStore.getState();
    if (store.activeCaptureMode === "recap" || store.activeCaptureMode === "note") {
      return;
    }
    if (store.mode === "realtime" && store.status === "live") {
      sessionRef.current?.setMicMuted(true);
      store.setInputDraft("");
    }

    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) {
      toast.message("Browser speech isn't available — type your message instead.");
      return;
    }
    const rec = new SR();
    pttShouldSendRef.current = false;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      let out = "";
      for (let i = 0; i < e.results.length; i++) out += e.results[i][0].transcript;
      useAgentStore.getState().setInputDraft(out.replace(/\s+/g, " ").trimStart());
    };
    rec.onerror = (ev) => {
      if (ev.error !== "no-speech" && ev.error !== "aborted")
        toast.error(`Mic error: ${ev.error}`);
    };
    rec.onend = () => {
      const current = useAgentStore.getState();
      const finalText = current.inputDraft.trim();
      current.setActivity("idle");
      if (pttShouldSendRef.current && finalText) {
        pttShouldSendRef.current = false;
        current.setInputDraft("");
        void sendRep(finalText);
        return;
      }
      pttShouldSendRef.current = false;
    };
    try {
      rec.start();
      store.setActivity("listening");
      store.setError(null);
      speechRef.current = rec;
    } catch {
      /* already started */
    }
  }, [sendRep]);

  const pttStop = useCallback(() => {
    const store = useAgentStore.getState();
    if (store.activeCaptureMode === "recap" || store.activeCaptureMode === "note") {
      return;
    }
    if (store.mode === "realtime" && store.status === "live") {
      sessionRef.current?.setMicMuted(true);
    }

    pttShouldSendRef.current = true;
    speechRef.current?.stop();
    speechRef.current = null;
  }, []);

  const dictateRecap = useCallback(() => {
    const store = useAgentStore.getState();
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) {
      toast.message("Browser speech isn't available — type the recap instead.");
      return;
    }

    speechRef.current?.abort();
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      let out = "";
      for (let i = 0; i < e.results.length; i++) out += e.results[i][0].transcript;
      useAgentStore.getState().setInputDraft(out.replace(/\s+/g, " ").trimStart());
    };
    rec.onerror = (ev) => {
      if (ev.error !== "no-speech" && ev.error !== "aborted")
        toast.error(`Mic error: ${ev.error}`);
    };
    rec.onend = () => {
      const current = useAgentStore.getState();
      const text = current.inputDraft.trim();
      if (text) {
        current.setInputDraft("");
        const customerId = current.selectedCustomerId;
        if (!customerId) {
          toast.error("Select a customer first");
        } else {
          void ingestCallRecap({
            customerId,
            title: "Call recap",
            transcript: text,
            callDate: new Date().toISOString().split("T")[0],
            qc,
          }).catch(() => toast.error("Failed to save recap"));
        }
      }
      current.setActivity("idle");
      speechRef.current = null;
    };

    try {
      if (store.status !== "live") {
        store.setMode("simulation");
        store.start();
      }
      rec.start();
      store.setActivity("listening");
      store.setError(null);
      speechRef.current = rec;
    } catch {
      toast.message("Speech capture is already active.");
    }
  }, [qc]);

  /** Switch voice mode, adjusting a live session accordingly. */
  const setVoiceMode = useCallback(
    (m: VoiceMode) => {
      const store = useAgentStore.getState();
      store.setVoiceMode(m);
      if (store.status !== "live") return;

      if (m === "ptt") {
        pttShouldSendRef.current = false;
        speechRef.current?.abort();
        speechRef.current = null;
        store.setHandsFree(false);
        store.setActivity("idle");
        if (store.mode === "realtime") sessionRef.current?.setMicMuted(true);
      } else {
        store.setHandsFree(true);
        if (store.mode === "realtime") {
          sessionRef.current?.setMicMuted(false);
          store.setActivity("listening");
          return;
        }
        speechRef.current = startHandsFreeRecognition();
        if (!speechRef.current)
          toast.message("Browser speech not available — use the text box instead.");
      }
    },
    [startHandsFreeRecognition]
  );

  /**
   * Generate an editable post-call note draft from imported transcripts or the
   * rep's recap. This never persists the note; Save note handles that.
   */
  const captureNote = useCallback(async () => {
    const store = useAgentStore.getState();
    const conversation = postCallConversationSource();
    const contexts = store.selectedCustomerId
      ? await api.getCallContexts(store.selectedCustomerId).catch(() => [] as CallContext[])
      : [];
    if (!contexts[0]?.transcript?.trim() && !conversation.trim()) {
      await sayAgent("I need a transcript or quick call recap before I can create post-call notes.");
      store.setCenterView("recap");
      return;
    }

    const customerId = await resolveCustomer();
    if (!customerId) {
      toast.message("Choose a customer first", {
        description: "Use the context chip so the note is filed correctly.",
      });
      await sayAgent("Pick a customer in the context chip before generating post-call notes.");
      return;
    }

    store.setCenterView("notes");
    store.setPostCallLoading(true);
    store.setActivity("thinking");
    const res = await api.draftNote(customerId, conversation).catch(() => null);
    store.setPostCallLoading(false);
    if (!res || "insufficient" in res) {
      await sayAgent(
        "I need a transcript or quick call recap before I can create post-call notes."
      );
      store.setCenterView("recap");
      return;
    }

    store.setPostCallDraft(res);
    await sayAgent("I drafted the post-call notes. Review and edit them, then save the note.");
  }, [resolveCustomer, sayAgent]);

  const updatePostCallDraft = useCallback((draft: StructuredNote | null) => {
    useAgentStore.getState().setPostCallDraft(draft);
  }, []);

  const savePostCallNote = useCallback(async () => {
    const store = useAgentStore.getState();
    const customerId = await resolveCustomer();
    if (!customerId || !store.postCallDraft) {
      await sayAgent("Generate post-call notes before saving.");
      return;
    }

    await runTool(
      "save_note",
      { customerId, structuredNote: store.postCallDraft, source: "call" },
      undefined
    );
    store.setPostCallDraft(null);
    await sayAgent("Saved — I added the post-call note to Notes.");
  }, [resolveCustomer, runTool, sayAgent]);

  const end = useCallback(() => {
    clearRealtimeFallback();
    if (pttRealtimeMuteTimerRef.current) {
      window.clearTimeout(pttRealtimeMuteTimerRef.current);
      pttRealtimeMuteTimerRef.current = null;
    }
    sessionRef.current?.close();
    sessionRef.current = null;
    speechRef.current?.abort();
    speechRef.current = null;
    useAgentStore.getState().end();
  }, [clearRealtimeFallback]);

  useEffect(
    () => () => {
      clearRealtimeFallback();
      if (pttRealtimeMuteTimerRef.current) {
        window.clearTimeout(pttRealtimeMuteTimerRef.current);
        pttRealtimeMuteTimerRef.current = null;
      }
      sessionRef.current?.close();
      sessionRef.current = null;
      speechRef.current?.abort();
      speechRef.current = null;
    },
    [clearRealtimeFallback]
  );

  return {
    status,
    startRealtime,
    startSimulation,
    sendRep,
    editTurn,
    seedCorrectionDemo,
    captureNote,
    savePostCallNote,
    updatePostCallDraft,
    dealBrief,
    createFollowUp,
    interrupt,
    toggleMic,
    pttStart,
    pttStop,
    dictateRecap,
    setVoiceMode,
    end,
  };
}
