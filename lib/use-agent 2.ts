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
import { shortDate } from "./format";
import type { CallContext, Customer } from "./types";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

export function useAgent(sessionId: string) {
  const sessionRef = useRef<RealtimeSession | null>(null);
  const speechRef = useRef<SpeechRec | null>(null);
  const pttShouldSendRef = useRef(false);
  const status = useAgentStore((s) => s.status);
  const qc = useQueryClient();

  useEffect(() => {
    useAgentStore.getState().init(sessionId);
  }, [sessionId]);

  const runTool = useCallback(
    async (
      name: RealtimeToolName,
      args: Record<string, unknown>,
      triggerTurnId?: string
    ): Promise<{ id: string; result: unknown }> => {
      const store = useAgentStore.getState();
      const action = makeAgentAction(name, args, triggerTurnId);
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
    store.setActivity("thinking");
    await wait(gap);
    store.setActivity("speaking");
    store.addAgentTurn(text);
    await wait(Math.min(1500, 380 + text.length * 16));
    store.setActivity("idle");
  }, []);

  const resolveCustomer = useCallback(
    async (name?: string, fallback?: string): Promise<string | null> => {
      const sel = useAgentStore.getState().selectedCustomerId;
      if (sel) return sel;
      const query = name ?? (fallback ? cleanQuery(fallback) : "");
      if (!query.trim()) return null;
      const { result } = await runTool("search_customer", { query });
      const ranked = (result as { ranked?: { id: string; confidence: number }[] }).ranked;
      if (ranked && ranked[0] && ranked[0].confidence >= 0.55) {
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

      if (intent.kind === "end") {
        await sayAgent("Okay — I'm here when you need me.");
        return;
      }
      if (intent.kind === "chat") {
        await sayAgent(intent.reply);
        return;
      }

      if (intent.kind === "create_customer") {
        await sayAgent(`Got it — creating a customer record for ${intent.name} at ${intent.company}.`);
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
        await sayAgent("Let me pull that up.");
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
        const openTasks = (hist.tasks ?? []).filter((t) => !t.done);
        const notes = hist.notes ?? [];
        const hasTranscripts = Array.isArray(contexts) && contexts.length > 0;

        // Build a richer "about" — who they are, where the deal is, what
        // matters now, and what's outstanding.
        const parts: string[] = [];
        if (customer) {
          parts.push(
            `${customer.name} is at ${customer.company}, currently in ${customer.stage}.`
          );
        }
        if (notes[0]) {
          const detail = notes[0].body
            ? ` ${notes[0].body.split(/(?<=[.?!])\s/)[0]}`
            : "";
          parts.push(`Latest: "${notes[0].headline}".${detail}`);
        }
        if (notes[1]) parts.push(`Also on file: "${notes[1].headline}".`);
        if (openTasks.length) {
          parts.push(
            `${openTasks.length} open follow-up${openTasks.length === 1 ? "" : "s"} — next: "${openTasks[0].title}"${openTasks[0].dueDate ? ` (due ${shortDate(openTasks[0].dueDate)})` : ""}.`
          );
        }
        parts.push(
          hasTranscripts
            ? `${contexts.length} call transcript${contexts.length === 1 ? "" : "s"} on file — say "deal brief" for the full prep.`
            : "No call transcripts yet — import one for call-level detail."
        );
        await sayAgent(parts.join(" "));
        return;
      }

      if (intent.kind === "summarize_call") {
        const customerId = await resolveCustomer(intent.name, rawText);
        if (!customerId) {
          await sayAgent("Which customer should I summarize? Tell me their name.");
          return;
        }
        await sayAgent("Let me check the call context.");
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
          await sayAgent("Who's this note for? Tell me the customer.");
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
        await sayAgent(`Got it. I'll save a note: "${truncate(noteText)}". Saving now.`);
        await runTool("save_note", { customerId, rawText: noteText }, repTurnId);
        await sayAgent("Saved.");
        return;
      }

      if (intent.kind === "task") {
        const customerId = await resolveCustomer(intent.name, rawText);
        if (!customerId) {
          await sayAgent("Who should I set that reminder for?");
          return;
        }
        await sayAgent(
          `Got it — I'll set a reminder to ${lower(intent.title)}${
            intent.dateText ? ` ${prep(intent.dateText)}` : ""
          }. Creating now.`
        );
        const { result } = await runTool(
          "create_task",
          { customerId, title: intent.title, dueDate: intent.dateText, priority: "med" },
          repTurnId
        );
        const due = (result as { dueDate?: string }).dueDate;
        await sayAgent(
          due ? `Done — reminder set for ${shortDate(due)}.` : "Done — task created."
        );
        return;
      }
    },
    [resolveCustomer, runTool, sayAgent]
  );

  /**
   * Deal Brief — turn customer context + transcripts + notes/tasks into a
   * one-screen pre-call briefing, shown in the center workspace. Runs the
   * context tools (visible in the action feed) before generating.
   */
  const dealBrief = useCallback(async () => {
    const store = useAgentStore.getState();
    const customerId = await resolveCustomer();
    if (!customerId) {
      toast.message("Pick a customer first", {
        description: "Choose who to brief in the context chip.",
      });
      await sayAgent("Who should I brief you on? Pick a customer up top.");
      return;
    }
    store.setBriefLoading(true);
    store.setCenterView("recap");
    store.setActivity("thinking");
    await Promise.all([
      runTool("get_customer_history", { customerId }),
      runTool("get_call_context", { customerId }),
    ]);
    try {
      const res = await api.generateBrief(customerId);
      if ("insufficientContext" in res) {
        store.setBriefLoading(false);
        store.setCenterView("transcript");
        store.setActivity("idle");
        await sayAgent(
          "I need a transcript or notes before I can make a real deal brief. Want to import one?"
        );
        return;
      }
      store.setDealBrief(res);
      store.setBriefLoading(false);
      await sayAgent(`Here's your brief on ${res.customerName}. ${res.nextMove}`);
    } catch {
      store.setBriefLoading(false);
      store.setCenterView("transcript");
      store.setActivity("idle");
      toast.error("Couldn't generate the brief");
    }
  }, [resolveCustomer, runTool, sayAgent]);

  /** Create a follow-up task directly (used by the Deal Brief card buttons). */
  const createFollowUp = useCallback(
    async (title: string) => {
      const customerId = await resolveCustomer();
      if (!customerId) {
        toast.error("Pick a customer first.");
        return;
      }
      await runTool("create_task", { customerId, title, priority: "med" });
      toast.success("Follow-up created");
    },
    [resolveCustomer, runTool]
  );

  /** Barge-in: stop the agent mid-sentence so the rep can take over. */
  const interrupt = useCallback(() => {
    const store = useAgentStore.getState();
    if (sessionRef.current && store.mode === "realtime")
      sessionRef.current.interrupt();
    store.setActivity("idle");
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

      const intent = interpret(trimmed);
      // Deal Brief renders a card in both modes — intercept before routing.
      if (intent.kind === "deal_brief") {
        await dealBrief();
        return;
      }

      if (sessionRef.current && store.mode === "realtime") {
        sessionRef.current.askText(trimmed);
        return;
      }
      demoPulse();
      await handleIntent(intent, turn.id, trimmed);
    },
    [handleIntent, dealBrief, demoPulse]
  );

  const startWebSpeech = useCallback((onFinal: (text: string) => void) => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return null;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          const text = r[0].transcript.trim();
          if (text) onFinal(text);
        }
      }
    };
    rec.onend = () => {
      const store = useAgentStore.getState();
      if (store.handsFree && store.mode === "simulation") {
        // Auto-restart on end (browser stops after silence)
        try { rec.start(); } catch { /* already started */ }
      } else {
        store.setActivity("idle");
      }
    };
    rec.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") {
        toast.error(`Mic error: ${e.error}`);
      }
    };
    try {
      rec.start();
    } catch {
      return null;
    }
    return rec;
  }, []);

  const startSimulation = useCallback(async () => {
    const store = useAgentStore.getState();
    store.setMode("simulation");
    store.start();
    store.setError(null);
    store.setActivity("idle");
    const ptt = store.voiceMode === "ptt";
    store.setHandsFree(!ptt);
    await sayAgent(
      ptt
        ? "Hey — hold the mic to talk (I'll fill the box so you can edit), or just type. I can look someone up, save a note, or set a follow-up."
        : "Hey — I'm listening. Ask me to look someone up, save a note, import a call transcript, or set a follow-up."
    );
  }, [sayAgent]);

  const startRealtime = useCallback(
    async (customer: Customer | null) => {
      const store = useAgentStore.getState();
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
          onTranscript: (t) => useAgentStore.getState().addUserTurn(t),
          onAgentText: (t) => useAgentStore.getState().addAgentTurn(t),
          onTool: async (name, args) => (await runTool(name, args)).result,
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
        // In push-to-talk we drive input via the reviewed text box, so silence
        // the always-on VAD mic until the rep holds to talk.
        if (ptt) session.setMicMuted(true);
        toast.success(
          ptt ? "Connected — hold the mic to talk" : "Connected — start talking"
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg === "mic-denied") {
          useAgentStore.getState().setError("mic-blocked");
          toast.error("Microphone blocked", {
            description:
              "Allow mic access in your browser, then tap to start again. Using demo mode for now.",
          });
        } else {
          toast.message("Voice unavailable — continue with text.", {
            description: "Live speech needs mic access (and OPENAI_API_KEY).",
          });
        }
        await startSimulation();
      }
    },
    [runTool, startSimulation]
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
    const next = !store.handsFree;
    store.setHandsFree(next);

    if (store.mode === "realtime") {
      sessionRef.current?.setMicMuted(!next);
      return;
    }

    // Simulation mode — use Web Speech API
    if (next) {
      store.setActivity("listening");
      speechRef.current = startWebSpeech((text) => {
        store.setActivity("idle");
        void sendRep(text);
      });
      if (!speechRef.current) {
        // Browser doesn't support speech recognition
        toast.message("Browser speech not available — use the text box instead.");
        store.setHandsFree(false);
        store.setActivity("idle");
      }
    } else {
      pttShouldSendRef.current = false;
      speechRef.current?.abort();
      speechRef.current = null;
      store.setActivity("idle");
    }
  }, [startWebSpeech, sendRep]);

  /**
   * Push-to-talk: while held, stream interim speech into the command bar. On
   * release, finalize the current draft through the same path as typed input.
   */
  const pttStart = useCallback(() => {
    const store = useAgentStore.getState();
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
      speechRef.current = rec;
    } catch {
      /* already started */
    }
  }, [sendRep]);

  const pttStop = useCallback(() => {
    pttShouldSendRef.current = true;
    speechRef.current?.stop();
    speechRef.current = null;
  }, []);

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
        } else {
          store.setActivity("listening");
          speechRef.current = startWebSpeech((text) => {
            useAgentStore.getState().setActivity("idle");
            void sendRep(text);
          });
        }
      }
    },
    [startWebSpeech, sendRep]
  );

  /**
   * Legacy copy of the agent hook. Keep generate semantics aligned with the
   * active hook: draft first, never auto-save generated notes.
   */
  const captureNote = useCallback(async () => {
    const store = useAgentStore.getState();
    const customerId = await resolveCustomer();
    if (!customerId) {
      toast.message("Choose a customer first", {
        description: "Use the context chip so the note is filed correctly.",
      });
      await sayAgent("Pick a customer in the context chip and I'll capture the note.");
      return;
    }

    store.setActivity("thinking");
    const conversation = store.transcript
      .filter((t) => t.role === "user" || t.speaker === "rep")
      .map((t) => t.content ?? t.text)
      .join(" ");

    const res = await api.draftNote(customerId, conversation).catch(() => null);
    store.setActivity("idle");
    if (!res || "insufficient" in res) {
      await sayAgent("I need a transcript or quick call recap before I can create post-call notes.");
      return;
    }

    store.setPostCallDraft(res);
    store.setCenterView("notes");
    await sayAgent("I drafted the post-call notes. Review and edit them, then save the note.");
  }, [resolveCustomer, sayAgent]);

  const end = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    speechRef.current?.abort();
    speechRef.current = null;
    useAgentStore.getState().end();
  }, []);

  useEffect(
    () => () => {
      sessionRef.current?.close();
      sessionRef.current = null;
      speechRef.current?.abort();
      speechRef.current = null;
    },
    []
  );

  return {
    status,
    startRealtime,
    startSimulation,
    sendRep,
    editTurn,
    seedCorrectionDemo,
    captureNote,
    dealBrief,
    createFollowUp,
    interrupt,
    toggleMic,
    pttStart,
    pttStop,
    setVoiceMode,
    end,
  };
}

function truncate(s: string, n = 80) {
  const t = s.trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}
function lower(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
function prep(dateText: string) {
  return /^(on|in|next|this|today|tomorrow|tonight)/i.test(dateText.trim())
    ? dateText
    : `on ${dateText}`;
}
