"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ActionEvent, DealBrief, StructuredNote, TranscriptTurn } from "./types";
import type { AgentActivity } from "./realtime-client";

export type CenterView = "transcript" | "recap" | "notes";

export type AgentStatus = "idle" | "connecting" | "live" | "ended";
export type AgentMode = "realtime" | "simulation" | null;
/** How the rep talks: push-to-talk (review before send) vs continuous (VAD). */
export type VoiceMode = "ptt" | "continuous";
/**
 * Which feature is currently capturing microphone input.
 * "recap"  → recap dictation is active; normal chat recognition is suspended.
 * "chat"   → normal hands-free chat is active (default / null is equivalent).
 */
export type CaptureMode = "chat" | "recap" | null;

interface AgentState {
  sessionId: string | null;
  selectedCustomerId: string | null;
  status: AgentStatus;
  mode: AgentMode;
  activity: AgentActivity;
  handsFree: boolean;
  voiceMode: VoiceMode;
  /** Draft in the command bar — shared so push-to-talk can populate it. */
  inputDraft: string;
  /** Mic input amplitude (0..1) for the reactive orb. */
  micLevel: number;
  /** Non-null when something is wrong (e.g. mic blocked) — drives orb error state. */
  errorMsg: string | null;
  /** Which view fills the center workspace. */
  centerView: CenterView;
  dealBrief: DealBrief | null;
  dealBriefAt: number | null;
  briefLoading: boolean;
  /** True when the last brief attempt had no context — drives suggestion chips in ContextPrompts. */
  briefNeedsContext: boolean;
  /** Pending auto-open action for the Call recap tab (consumed on mount). */
  recapAction: "dictate" | "type" | null;
  /** Which feature currently owns the microphone. Recap dictation suspends chat recognition. */
  activeCaptureMode: CaptureMode;
  postCallDraft: StructuredNote | null;
  postCallLoading: boolean;
  startedAt: number | null;
  transcript: TranscriptTurn[];
  actions: ActionEvent[];
  /** Saved threads per customer id ("__none" for no customer selected). */
  threads: Record<
    string,
    {
      transcript: TranscriptTurn[];
      actions: ActionEvent[];
      dealBrief: DealBrief | null;
      dealBriefAt: number | null;
    }
  >;

  init: (sessionId: string) => void;
  setVoiceMode: (m: VoiceMode) => void;
  setInputDraft: (s: string) => void;
  setMicLevel: (n: number) => void;
  setError: (msg: string | null) => void;
  setCenterView: (v: CenterView) => void;
  setDealBrief: (b: DealBrief | null) => void;
  setBriefLoading: (v: boolean) => void;
  setBriefNeedsContext: (v: boolean) => void;
  /** Navigate to the recap tab and optionally auto-open an inline view. Atomic. */
  openRecap: (action?: "dictate" | "type") => void;
  consumeRecapAction: () => void;
  setActiveCaptureMode: (mode: CaptureMode) => void;
  setPostCallDraft: (n: StructuredNote | null) => void;
  setPostCallLoading: (v: boolean) => void;
  /** Set the selected customer without touching the conversation (agent use). */
  setSelectedCustomer: (id: string | null) => void;
  /** User-initiated context switch — starts a fresh thread for the new customer. */
  switchCustomer: (id: string | null) => void;
  setStatus: (s: AgentStatus) => void;
  setMode: (m: AgentMode) => void;
  setActivity: (a: AgentActivity) => void;
  setHandsFree: (v: boolean) => void;
  start: () => void;

  addTurn: (turn: TranscriptTurn) => void;
  addUserTurn: (content: string) => TranscriptTurn;
  addAgentTurn: (content: string) => TranscriptTurn;
  editTurn: (id: string, text: string) => void;

  addAction: (a: ActionEvent) => void;
  updateAction: (
    id: string,
    patch: Partial<
      Pick<ActionEvent, "status" | "result" | "error" | "superseded" | "supersededBy">
    >
  ) => void;

  end: () => void;
  reset: () => void;
}

const rid = () => Math.random().toString(36).slice(2, 10);
const threadKey = (customerId: string | null) => customerId ?? "__none";

export function makeAgentTurn(
  speaker: "rep" | "agent",
  text: string,
  confidence = 0.97,
  pending = false,
  customerId: string | null = null
): TranscriptTurn {
  const at = Date.now();
  const createdAt = new Date(at).toISOString();
  return {
    id: rid(),
    role: speaker === "rep" ? "user" : "assistant",
    content: text,
    customerId,
    createdAt,
    speaker,
    text,
    originalText: text,
    edited: false,
    confidence,
    at,
    partial: pending,
  };
}

export function makeAgentAction(
  name: ActionEvent["name"],
  args: Record<string, unknown>,
  triggerTurnId?: string
): ActionEvent {
  return {
    id: rid(),
    name,
    args,
    status: "pending",
    at: Date.now(),
    triggerTurnId,
  };
}

const initial = {
  sessionId: null,
  selectedCustomerId: null,
  status: "idle" as AgentStatus,
  mode: null as AgentMode,
  activity: "idle" as AgentActivity,
  handsFree: false,
  voiceMode: "ptt" as VoiceMode,
  inputDraft: "",
  micLevel: 0,
  errorMsg: null as string | null,
  centerView: "transcript" as CenterView,
  dealBrief: null as DealBrief | null,
  dealBriefAt: null as number | null,
  briefLoading: false,
  briefNeedsContext: false,
  recapAction: null as "dictate" | "type" | null,
  activeCaptureMode: null as CaptureMode,
  postCallDraft: null as StructuredNote | null,
  postCallLoading: false,
  startedAt: null,
  transcript: [],
  actions: [],
  threads: {} as Record<
    string,
    {
      transcript: TranscriptTurn[];
      actions: ActionEvent[];
      dealBrief: DealBrief | null;
      dealBriefAt: number | null;
    }
  >,
};

function normalizeTurn(
  turn: TranscriptTurn,
  selectedCustomerId: string | null
): TranscriptTurn {
  const speaker =
    turn.speaker ?? (turn.role === "assistant" ? "agent" : "rep");
  const role = turn.role ?? (speaker === "agent" ? "assistant" : "user");
  const text = turn.text ?? turn.content ?? "";
  const content = turn.content ?? text;
  const at = turn.at ?? (turn.createdAt ? Date.parse(turn.createdAt) : Date.now());

  return {
    ...turn,
    role,
    content,
    customerId: turn.customerId ?? selectedCustomerId,
    createdAt: turn.createdAt ?? new Date(at).toISOString(),
    speaker,
    text,
    originalText: turn.originalText ?? text,
    edited: turn.edited ?? false,
    confidence: turn.confidence ?? 0.97,
    at,
  };
}

function patchActiveThread(
  state: AgentState,
  patch: Partial<{
    transcript: TranscriptTurn[];
    actions: ActionEvent[];
    dealBrief: DealBrief | null;
    dealBriefAt: number | null;
  }>
) {
  const key = threadKey(state.selectedCustomerId);
  const current = state.threads[key] ?? {
    transcript: state.transcript,
    actions: state.actions,
    dealBrief: state.dealBrief,
    dealBriefAt: state.dealBriefAt,
  };
  return {
    ...state.threads,
    [key]: {
      ...current,
      ...patch,
    },
  };
}

function normalizeThreads(
  threads: AgentState["threads"] | undefined,
  selectedCustomerId: string | null
): AgentState["threads"] {
  if (!threads) return {};

  return Object.fromEntries(
    Object.entries(threads).map(([key, thread]) => {
      const customerId = key === "__none" ? null : key;
      return [
        key,
        {
          ...thread,
          transcript: (thread.transcript ?? []).map((turn) =>
            normalizeTurn(turn, customerId ?? selectedCustomerId)
          ),
          actions: thread.actions ?? [],
          dealBrief: thread.dealBrief ?? null,
          dealBriefAt: thread.dealBriefAt ?? null,
        },
      ];
    })
  );
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => ({
      ...initial,

      init: (sessionId) => {
        if (get().sessionId !== sessionId)
          set({ ...initial, sessionId, voiceMode: get().voiceMode });
      },
      setVoiceMode: (voiceMode) => set({ voiceMode }),
      setInputDraft: (inputDraft) => set({ inputDraft }),
      setMicLevel: (micLevel) => set({ micLevel }),
      setError: (errorMsg) => set({ errorMsg }),
      setCenterView: (centerView) => set({ centerView }),
      setDealBrief: (dealBrief) =>
        set((s) => {
          const dealBriefAt = dealBrief ? Date.now() : null;
          return {
            dealBrief,
            dealBriefAt,
            threads: patchActiveThread(s, { dealBrief, dealBriefAt }),
          };
        }),
      setBriefLoading: (briefLoading) => set({ briefLoading }),
      setBriefNeedsContext: (briefNeedsContext) => set({ briefNeedsContext }),
      openRecap: (action) => set({ centerView: "recap", recapAction: action ?? null }),
      consumeRecapAction: () => set({ recapAction: null }),
      setActiveCaptureMode: (activeCaptureMode) => set({ activeCaptureMode }),
      setPostCallDraft: (postCallDraft) => set({ postCallDraft }),
      setPostCallLoading: (postCallLoading) => set({ postCallLoading }),
      setSelectedCustomer: (selectedCustomerId) => set({ selectedCustomerId }),
      switchCustomer: (id) => {
        const s = get();
        if (s.selectedCustomerId === id) return;
        // Snapshot the current thread, then restore the target customer's.
        const oldKey = threadKey(s.selectedCustomerId);
        const threads = {
          ...s.threads,
          [oldKey]: {
            transcript: s.transcript,
            actions: s.actions,
            dealBrief: s.dealBrief,
            dealBriefAt: s.dealBriefAt,
          },
        };
        const target = threads[threadKey(id)] ?? {
          transcript: [],
          actions: [],
          dealBrief: null,
          dealBriefAt: null,
        };
        set({
          selectedCustomerId: id,
          threads,
          transcript: target.transcript.map((turn) =>
            normalizeTurn(turn, id)
          ),
          actions: target.actions,
          dealBrief: target.dealBrief,
          dealBriefAt: target.dealBriefAt ?? null,
          centerView: "transcript",
        });
      },
      setStatus: (status) => set({ status }),
      setMode: (mode) => set({ mode }),
      setActivity: (activity) => set({ activity }),
      setHandsFree: (handsFree) => set({ handsFree }),
      start: () =>
        set({ status: "live", startedAt: get().startedAt ?? Date.now() }),

      addTurn: (turn) =>
        set((s) => {
          const normalized = normalizeTurn(turn, s.selectedCustomerId);
          const transcript = [...s.transcript, normalized];
          return {
            transcript,
            threads: patchActiveThread(s, { transcript }),
          };
        }),
      addUserTurn: (content) => {
        const s = get();
        const turn = makeAgentTurn(
          "rep",
          content.trim(),
          0.97,
          false,
          s.selectedCustomerId
        );
        s.addTurn(turn);
        return turn;
      },
      addAgentTurn: (content) => {
        const s = get();
        const turn = makeAgentTurn(
          "agent",
          content.trim(),
          0.97,
          false,
          s.selectedCustomerId
        );
        s.addTurn(turn);
        return turn;
      },
      editTurn: (id, text) =>
        set((s) => {
          const transcript = s.transcript.map((t) =>
            t.id === id
              ? {
                  ...t,
                  text,
                  content: text,
                  edited: text.trim() !== t.originalText.trim(),
                }
              : t
          );
          return {
            transcript,
            threads: patchActiveThread(s, { transcript }),
          };
        }),

      addAction: (a) =>
        set((s) => {
          const actions = [...s.actions, a];
          return {
            actions,
            threads: patchActiveThread(s, { actions }),
          };
        }),
      updateAction: (id, patch) =>
        set((s) => {
          const actions = s.actions.map((a) =>
            a.id === id ? { ...a, ...patch } : a
          );
          return {
            actions,
            threads: patchActiveThread(s, { actions }),
          };
        }),

      end: () => set({ status: "ended", activity: "idle" }),
      reset: () => set({ ...initial }),
    }),
    {
      name: "briefly-agent",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({
        sessionId: s.sessionId,
        selectedCustomerId: s.selectedCustomerId,
        status: s.status,
        mode: s.mode,
        handsFree: s.handsFree,
        voiceMode: s.voiceMode,
        startedAt: s.startedAt,
        transcript: s.transcript,
        actions: s.actions,
        threads: s.threads,
      }),
      merge: (persisted, current) => {
        const restored = persisted as Partial<AgentState>;
        const selectedCustomerId =
          restored.selectedCustomerId ?? current.selectedCustomerId;
        const transcript = (restored.transcript ?? current.transcript).map(
          (turn) => normalizeTurn(turn, selectedCustomerId)
        );
        const threads = normalizeThreads(restored.threads, selectedCustomerId);

        return {
          ...current,
          ...restored,
          selectedCustomerId,
          transcript,
          threads,
        };
      },
    }
  )
);
