export type DealStage =
  | "Discovery"
  | "Qualification"
  | "Proposal"
  | "Negotiation"
  | "Closed Won"
  | "Closed Lost";

export type Priority = "low" | "med" | "high";

export type Speaker = "rep" | "agent";
export type TranscriptRole = "user" | "assistant";

export interface Note {
  id: string;
  customerId: string;
  createdAt: string;
  headline: string;
  body: string;
  source: "manual" | "call";
}

export interface Task {
  id: string;
  customerId: string;
  title: string;
  dueDate?: string;
  priority: Priority;
  done: boolean;
  createdAt: string;
  source: "manual" | "call";
  superseded?: boolean;
}

export interface Customer {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  stage: DealStage;
  lastContact: string;
  createdAt: string;
  notes: Note[];
  tasks: Task[];
}

/** A single attributed turn in the conversation transcript. */
export interface TranscriptTurn {
  id: string;
  role: TranscriptRole;
  content: string;
  customerId: string | null;
  createdAt: string;
  speaker: Speaker;
  text: string;
  /** Original text, kept so we can show an "edited" indicator. */
  originalText: string;
  edited: boolean;
  confidence: number; // 0..1 ASR confidence
  at: number;
  partial?: boolean;
}

export type ToolStatus = "pending" | "success" | "error";

/** One entry in the live action feed (a tool invocation). */
export interface ActionEvent {
  id: string;
  name:
    | "search_customer"
    | "get_customer_history"
    | "save_note"
    | "update_note"
    | "create_task"
    | "create_customer"
    | "save_call_context"
    | "generate_call_summary"
    | "get_call_context";
  args: Record<string, unknown>;
  status: ToolStatus;
  result?: unknown;
  error?: string;
  at: number;
  /** Set true when a later, corrected tool call replaces this one. */
  superseded?: boolean;
  supersededBy?: string;
  /** Id of the transcript turn that triggered this call (for re-runs). */
  triggerTurnId?: string;
}

export type CallContext = {
  id: string;
  customerId: string;
  title: string;
  transcript: string;
  participants?: string;
  callDate?: string;
  createdAt: string;
}

/** A one-screen sales briefing generated from customer context + transcripts. */
export interface DealBrief {
  customerId: string;
  customerName: string;
  leadWith: string;
  customerConcern: string[];
  likelyObjection: string[];
  suggestedTalkTrack: string;
  recommendedNextStep: string;
}

/** Structured note the agent can dictate (alongside a free-text fallback). */
export interface StructuredNote {
  mood?: string;
  title?: string;
  summary?: string;
  keyPoints?: string[];
  suggestedFollowUps?: string[];
}
