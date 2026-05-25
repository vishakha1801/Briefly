"use client";

import { useMemo, useState } from "react";
import {
  CalendarIcon,
  CheckSquare2Icon,
  ChevronDownIcon,
  MailIcon,
  PhoneIcon,
  StickyNoteIcon,
  PencilIcon,
  UploadIcon,
  CheckIcon,
  XIcon,
  Loader2Icon,
  SearchIcon,
  ClockIcon,
  ListChecksIcon,
  UserPlusIcon,
  FileTextIcon,
  ArrowLeftIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { makeAgentAction, useAgentStore } from "@/lib/agent-store";
import { useCallContexts, useCustomer } from "@/lib/hooks";
import { api } from "@/lib/api";
import { relativeDate, shortDate } from "@/lib/format";
import { ImportCallModal } from "@/components/voice/import-call-modal";
import { cn } from "@/lib/utils";
import type {
  ActionEvent,
  CallContext,
  Customer,
  DealStage,
  Note,
  Priority,
  Task,
} from "@/lib/types";

const STAGE_COLORS: Record<DealStage, string> = {
  Discovery: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  Qualification: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  Proposal: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  Negotiation: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  "Closed Won": "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  "Closed Lost": "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
};

const PRIORITY_DOT: Record<Priority, string> = {
  high: "bg-rose-500",
  med: "bg-amber-400",
  low: "bg-zinc-400",
};

function summarizeTranscript(transcript: string) {
  const normalized = transcript.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const firstSentence = normalized.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim();
  const summary =
    firstSentence && firstSentence.length >= 40
      ? firstSentence
      : normalized.slice(0, 220);
  return summary.length < normalized.length
    ? `${summary.replace(/[.…]+$/, "")}...`
    : summary;
}

// ── Note body parsing (supports both new simplified and legacy formats) ──────

const MOOD_META_SIDEBAR: Record<string, { emoji: string; classes: string }> = {
  positive: { emoji: "😊", classes: "text-emerald-600 bg-emerald-50/70 border-emerald-200/50" },
  "high intent": { emoji: "🔥", classes: "text-orange-600 bg-orange-50/70 border-orange-200/50" },
  cautious: { emoji: "⚠️", classes: "text-amber-600 bg-amber-50/70 border-amber-200/50" },
  neutral: { emoji: "😐", classes: "text-zinc-500 bg-zinc-50/70 border-zinc-200/50" },
  mixed: { emoji: "〰️", classes: "text-violet-600 bg-violet-50/70 border-violet-200/50" },
};

function getMoodMeta(mood: string) {
  return MOOD_META_SIDEBAR[mood.toLowerCase()] ?? { emoji: "📋", classes: "text-muted-foreground bg-white/40 border-brand/10" };
}

function parseNoteBody(body: string) {
  const isNew = /^Mood:/m.test(body);
  if (isNew) {
    const mood = body.match(/^Mood:\s*(.+)/m)?.[1]?.trim() ?? "";
    const summary =
      body.match(/Summary:\n([\s\S]*?)(?:\n\nKey points:|\n\nSuggested follow-ups:|$)/)?.[1]?.trim() ?? "";
    const keyPoints =
      body
        .match(/Key points:\n([\s\S]*?)(?:\n\nSuggested follow-ups:|\n\n|$)/)?.[1]
        ?.split(/\r?\n/)
        .map((l) => l.replace(/^•\s*/, "").trim())
        .filter(Boolean) ?? [];
    const followUps =
      body
        .match(/Suggested follow-ups:\n([\s\S]*?)(?:\n\n|$)/)?.[1]
        ?.split(/\r?\n/)
        .map((l) => l.replace(/^•\s*/, "").trim())
        .filter(Boolean) ?? [];
    return { isNew: true, mood, summary, keyPoints, followUps };
  }

  // Legacy: parse old multi-section format
  const LEGACY_LABELS = ["Summary", "Pain points", "Objections", "Buying signals", "Next steps", "Follow-ups", "Key points", "Commitments", "Suggested follow-ups"];
  const labelRe = new RegExp(`^(${LEGACY_LABELS.join("|").replace(/ /g, "\\s+")}):\\s*$`, "i");
  const sections: Record<string, string> = {};
  let cur: string | null = null;
  const buf: string[] = [];

  for (const line of body.split(/\r?\n/)) {
    const m = line.trim().match(labelRe);
    if (m) {
      if (cur && buf.join("\n").trim()) sections[cur.toLowerCase()] = buf.join("\n").trim();
      cur = m[1];
      buf.length = 0;
    } else if (cur) {
      buf.push(line);
    }
  }
  if (cur && buf.join("\n").trim()) sections[cur.toLowerCase()] = buf.join("\n").trim();

  const bullets = (raw: string) =>
    raw.split(/\r?\n/).map((l) => l.replace(/^[-•]\s*/, "").trim()).filter(Boolean);

  const summary = sections["summary"] ?? body.replace(/\s+/g, " ").trim().slice(0, 180);
  const keyPoints = [
    ...bullets(sections["pain points"] ?? ""),
    ...bullets(sections["key points"] ?? ""),
  ].slice(0, 3);
  const followUps = bullets(sections["suggested follow-ups"] ?? sections["follow-ups"] ?? "");

  return { isNew: false, mood: sections["sentiment"] ?? "", summary, keyPoints, followUps };
}

function derivedNoteSource(note: Note, action?: ActionEvent) {
  if (action?.args && "structuredNote" in action.args) return "generated";
  if (note.source === "manual") return "manual";
  if (note.source === "call") return "generated";
  return "call recap";
}

export function RightSidebar() {
  const [importOpen, setImportOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("customer");
  const [selectedTranscript, setSelectedTranscript] =
    useState<CallContext | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState({ headline: "", body: "" });
  const qc = useQueryClient();
  const selectedId = useAgentStore((s) => s.selectedCustomerId);
  const actions = useAgentStore((s) => s.actions);
  const { data: customer } = useCustomer(selectedId ?? "");
  const { data: callContexts } = useCallContexts(selectedId ?? "");

  const activeActions = actions.filter((a) => !a.superseded);
  const pendingAction = activeActions.find((a) => a.status === "pending");
  const activeTranscript =
    selectedTranscript?.customerId === selectedId ? selectedTranscript : null;
  const transcriptSummary = activeTranscript
    ? summarizeTranscript(activeTranscript.transcript)
    : "";
  const activeNote = customer?.notes.find((note) => note.id === selectedNoteId) ?? null;
  const latestNote = customer?.notes[0] ?? null;
  const taskPreview = customer?.tasks.filter((task) => !task.superseded).slice(0, 3) ?? [];
  const transcriptCount = callContexts?.length ?? 0;
  const noteActionById = useMemo(() => {
    const map = new Map<string, ActionEvent>();
    for (const action of actions) {
      if (action.name !== "save_note" || action.status !== "success") continue;
      const id = (action.result as { id?: string } | undefined)?.id;
      if (id && !map.has(id)) map.set(id, action);
    }
    return map;
  }, [actions]);

  function openNote(note: Note) {
    setSelectedNoteId(note.id);
    setNoteEditing(false);
    setNoteDraft({ headline: note.headline, body: note.body });
  }

  function startNoteEdit(note: Note) {
    setNoteDraft({ headline: note.headline, body: note.body });
    setNoteEditing(true);
  }

  async function saveNoteEdit(note: Note) {
    const headline = noteDraft.headline.trim();
    if (!headline) return;
    const action = makeAgentAction("update_note", {
      noteId: note.id,
      headline,
    });
    useAgentStore.getState().addAction(action);
    try {
      const updated = await api.updateNote({
        noteId: note.id,
        headline,
        body: noteDraft.body,
      });
      useAgentStore.getState().updateAction(action.id, {
        status: "success",
        result: updated,
      });
      useAgentStore.getState().addAgentTurn("Updated the note.");
      setNoteEditing(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["customer", note.customerId] }),
        qc.invalidateQueries({ queryKey: ["customers"] }),
      ]);
    } catch (err) {
      useAgentStore.getState().updateAction(action.id, {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <>
      <ImportCallModal open={importOpen} onOpenChange={setImportOpen} />

      <Tabs
        value={activeTab}
        onValueChange={(next) => {
          setActiveTab(next);
          if (next !== "notes") {
            setSelectedNoteId(null);
            setNoteEditing(false);
          }
          if (next !== "customer") setSelectedTranscript(null);
        }}
        className="flex h-full flex-col gap-0"
      >
        <TabsList className="mx-1 mb-3 flex h-8 w-[calc(100%-0.5rem)] min-w-0 shrink-0 items-center gap-0.5 overflow-x-auto rounded-sm border border-brand/10 bg-brand/5 p-0.5">
          <TabsTrigger
            value="customer"
            className="h-6 shrink-0 rounded-xs px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-white/45 hover:text-foreground data-[state=active]:border data-[state=active]:border-brand/8 data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-[0_2px_8px_rgba(59,73,234,0.08)] sm:px-3"
          >
            Customer
          </TabsTrigger>
          <TabsTrigger
            value="actions"
            className="h-6 shrink-0 rounded-xs px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-white/45 hover:text-foreground data-[state=active]:border data-[state=active]:border-brand/8 data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-[0_2px_8px_rgba(59,73,234,0.08)] sm:px-3"
          >
            Actions
            {actions.length > 0 && (
              <span className="rounded-xs bg-brand/10 px-1 text-[9px] font-semibold tabular-nums text-brand">
                {actions.length}
              </span>
            )}
            {pendingAction && (
              <Loader2Icon className="size-2.5 animate-spin text-amber-500" />
            )}
          </TabsTrigger>
          <TabsTrigger
            value="notes"
            className="h-6 shrink-0 rounded-xs px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-white/45 hover:text-foreground data-[state=active]:border data-[state=active]:border-brand/8 data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-[0_2px_8px_rgba(59,73,234,0.08)] sm:px-3"
          >
            Notes
          </TabsTrigger>
        </TabsList>

        {/* CUSTOMER TAB */}
        <TabsContent
          value="customer"
          className="thin-scroll min-h-0 flex-1 overflow-y-auto focus-visible:outline-none"
        >
          {activeTranscript ? (
            <div className="space-y-3 px-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                onClick={() => setSelectedTranscript(null)}
              >
                <ArrowLeftIcon className="size-3.5" />
                Back
              </Button>

              <div className="glass-card space-y-3 rounded-md p-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold leading-snug text-foreground">
                    {activeTranscript.title}
                  </p>
                  <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {activeTranscript.callDate
                        ? shortDate(activeTranscript.callDate)
                        : relativeDate(activeTranscript.createdAt)}
                    </span>
                    {activeTranscript.participants && (
                      <span>{activeTranscript.participants}</span>
                    )}
                  </div>
                </div>

                {transcriptSummary && (
                  <div className="rounded-sm border border-brand/8 bg-brand/5 p-2">
                    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      Summary
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-foreground/80">
                      {transcriptSummary}
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Transcript
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-foreground/85">
                    {activeTranscript.transcript}
                  </p>
                </div>
              </div>
            </div>
          ) : !customer ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm font-medium text-foreground/60">No customer selected</p>
              <p className="max-w-[22ch] text-xs leading-relaxed text-muted-foreground">
                Choose a customer or create a new one to ground the co-pilot.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 px-1">
              <div className="glass-card rounded-md p-3 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-heading text-sm font-semibold truncate">{customer.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{customer.company}</div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`shrink-0 text-[10px] font-medium ${STAGE_COLORS[customer.stage]}`}
                  >
                    {customer.stage}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {customer.email && (
                    <a href={`mailto:${customer.email}`} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      <MailIcon className="size-3 shrink-0" />
                      <span className="truncate max-w-[150px]">{customer.email}</span>
                    </a>
                  )}
                  {customer.phone && (
                    <span className="flex items-center gap-1">
                      <PhoneIcon className="size-3 shrink-0" />
                      {customer.phone}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <CalendarIcon className="size-3 shrink-0" />
                    {relativeDate(customer.lastContact)}
                  </span>
                </div>
              </div>

              <div className="glass-card rounded-md p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <StickyNoteIcon className="size-3 text-muted-foreground" />
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Latest note</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 rounded-xs px-2 text-[10px]"
                    onClick={() => {
                      setActiveTab("notes");
                      if (latestNote) openNote(latestNote);
                    }}
                  >
                    View notes
                  </Button>
                </div>
                {!latestNote ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">No saved notes yet.</p>
                ) : (
                  <button
                    type="button"
                    onClick={() => { openNote(latestNote); setActiveTab("notes"); }}
                    className="w-full rounded-sm border border-brand/8 bg-brand/5 p-2 text-left transition-colors hover:border-brand/20 hover:bg-brand/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                  >
                    <p className="text-xs font-medium text-foreground">{latestNote.headline}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {parseNoteBody(latestNote.body).summary}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{relativeDate(latestNote.createdAt)}</p>
                  </button>
                )}
              </div>

              <div className="glass-card rounded-md p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <CheckSquare2Icon className="size-3 text-muted-foreground" />
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Tasks</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 rounded-xs px-2 text-[10px]"
                    onClick={() => setActiveTab("tasks")}
                  >
                    View tasks
                  </Button>
                </div>
                {taskPreview.length === 0 ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">No tasks yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {taskPreview.map((task) => (
                      <TaskPreviewRow key={task.id} task={task} />
                    ))}
                  </div>
                )}
              </div>

              <div className="glass-card rounded-md p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <FileTextIcon className="size-3 text-muted-foreground" />
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Call transcripts</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 rounded-xs px-2 text-[10px]"
                    onClick={() => setActiveTab("transcripts")}
                  >
                    View transcripts
                  </Button>
                </div>
                {transcriptCount === 0 ? (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    No transcript or call recap source available yet.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {callContexts?.slice(0, 2).map((ctx) => (
                      <button
                        key={ctx.id}
                        type="button"
                        onClick={() => { setSelectedTranscript(ctx); setActiveTab("customer"); }}
                        className="w-full rounded-sm border border-brand/8 bg-brand/5 p-2 text-left transition-colors hover:border-brand/20 hover:bg-brand/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                      >
                        <p className="truncate text-xs font-medium text-foreground">{ctx.title}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {ctx.callDate ? shortDate(ctx.callDate) : relativeDate(ctx.createdAt)}
                        </p>
                      </button>
                    ))}
                    {transcriptCount > 2 && (
                      <button
                        type="button"
                        onClick={() => setActiveTab("transcripts")}
                        className="px-1 text-[10px] text-brand hover:underline"
                      >
                        +{transcriptCount - 2} more transcript{transcriptCount - 2 === 1 ? "" : "s"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ACTIONS TAB */}
        <TabsContent
          value="actions"
          className="thin-scroll min-h-0 flex-1 overflow-y-auto focus-visible:outline-none"
        >
          {actions.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-sm font-medium text-foreground/60">No actions yet</p>
              <p className="max-w-[24ch] text-xs leading-relaxed text-muted-foreground">
                Tool calls will appear here when the agent searches customers, saves notes, or creates follow-ups.
              </p>
            </div>
          ) : (
            <div className="space-y-2 px-1">
              <AnimatePresence initial={false}>
                {[...actions].reverse().map((a) => (
                  <motion.div
                    key={a.id}
                    layout
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 8 }}
                    transition={{ type: "spring", duration: 0.4, bounce: 0.12 }}
                  >
                    <ActionRow action={a} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </TabsContent>

        {/* TRANSCRIPTS — no trigger; navigated to programmatically from the customer panel */}
        <TabsContent
          value="transcripts"
          className="thin-scroll min-h-0 flex-1 overflow-y-auto focus-visible:outline-none"
        >
          <div className="space-y-2 px-1">
            <div className="flex items-center gap-2 pb-1">
              <button
                type="button"
                onClick={() => setActiveTab("customer")}
                className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeftIcon className="size-3" />
                Back
              </button>
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                All transcripts
              </span>
            </div>
            {!callContexts || callContexts.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">No transcripts yet.</p>
            ) : (
              callContexts.map((ctx) => (
                <button
                  key={ctx.id}
                  type="button"
                  onClick={() => { setSelectedTranscript(ctx); setActiveTab("customer"); }}
                  className="w-full rounded-sm border border-brand/8 bg-brand/5 p-2.5 text-left transition-colors hover:border-brand/20 hover:bg-brand/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                >
                  <p className="truncate text-xs font-medium text-foreground">{ctx.title}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {ctx.callDate ? shortDate(ctx.callDate) : relativeDate(ctx.createdAt)}
                  </p>
                </button>
              ))
            )}
          </div>
        </TabsContent>

        {/* TASKS — no trigger; navigated to programmatically from the customer panel */}
        <TabsContent
          value="tasks"
          className="thin-scroll min-h-0 flex-1 overflow-y-auto focus-visible:outline-none"
        >
          <div className="mb-2 flex items-center gap-2 px-1">
            <button
              type="button"
              onClick={() => setActiveTab("customer")}
              className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeftIcon className="size-3" />
              Back
            </button>
          </div>
          <TasksTab customer={customer ?? null} />
        </TabsContent>

        {/* NOTES TAB */}
        <TabsContent
          value="notes"
          className="thin-scroll min-h-0 flex-1 overflow-y-auto focus-visible:outline-none"
        >
          <NotesTab
            customer={customer ?? null}
            selectedNoteId={selectedNoteId}
            noteEditing={noteEditing}
            noteDraft={noteDraft}
            noteActionById={noteActionById}
            onSelectNote={openNote}
            onBack={() => {
              setSelectedNoteId(null);
              setNoteEditing(false);
            }}
            onStartEdit={startNoteEdit}
            onCancelEdit={() => {
              if (!activeNote) return;
              setNoteEditing(false);
              setNoteDraft({ headline: activeNote.headline, body: activeNote.body });
            }}
            onSaveEdit={() => {
              if (activeNote) void saveNoteEdit(activeNote);
            }}
            onDraftChange={setNoteDraft}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

function NotesTab({
  customer,
  selectedNoteId,
  noteEditing,
  noteDraft,
  noteActionById,
  onSelectNote,
  onBack,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDraftChange,
}: {
  customer: Customer | null;
  selectedNoteId: string | null;
  noteEditing: boolean;
  noteDraft: { headline: string; body: string };
  noteActionById: Map<string, ActionEvent>;
  onSelectNote: (note: Note) => void;
  onBack: () => void;
  onStartEdit: (note: Note) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDraftChange: (draft: { headline: string; body: string }) => void;
}) {
  if (!customer || customer.notes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-medium text-foreground/60">No saved notes yet</p>
        <p className="max-w-[24ch] text-xs leading-relaxed text-muted-foreground">
          No saved notes yet. Generate post-call notes from a call recap or save a manual note.
        </p>
      </div>
    );
  }

  const activeNote = customer.notes.find((note) => note.id === selectedNoteId) ?? null;
  if (activeNote) {
    const parsed = parseNoteBody(activeNote.body);
    const moodMeta = parsed.mood ? getMoodMeta(parsed.mood) : null;
    const source = derivedNoteSource(activeNote, noteActionById.get(activeNote.id));

    return (
      <div className="space-y-3 px-1">
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground" onClick={onBack}>
          <ArrowLeftIcon className="size-3.5" />
          Back
        </Button>

        <div className="glass-card space-y-3 rounded-md p-3">
          {noteEditing ? (
            <>
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Note title</label>
                <Input
                  value={noteDraft.headline}
                  onChange={(event) => onDraftChange({ ...noteDraft, headline: event.target.value })}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Note body</label>
                <Textarea
                  value={noteDraft.body}
                  onChange={(event) => onDraftChange({ ...noteDraft, body: event.target.value })}
                  rows={10}
                  className="min-h-48 resize-none text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={onCancelEdit}>Cancel</Button>
                <Button type="button" size="sm" disabled={!noteDraft.headline.trim()} onClick={onSaveEdit}>Save</Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  {moodMeta && parsed.mood && (
                    <span className={cn("inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[11px] font-medium", moodMeta.classes)}>
                      {moodMeta.emoji} {parsed.mood}
                    </span>
                  )}
                  <p className="text-sm font-semibold leading-snug text-foreground">{activeNote.headline}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                    <span>{relativeDate(activeNote.createdAt)}</span>
                    <span className="rounded-xs bg-brand/10 px-1.5 py-0.5 text-brand">{source}</span>
                  </div>
                </div>
                <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground" onClick={() => onStartEdit(activeNote)}>
                  <PencilIcon className="size-3.5" />
                  Edit
                </Button>
              </div>

              {parsed.summary && (
                <div className="rounded-sm border border-brand/8 bg-brand/5 p-2">
                  <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Summary</p>
                  <p className="mt-1 text-xs leading-relaxed text-foreground/80">{parsed.summary}</p>
                </div>
              )}

              {parsed.keyPoints.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Key points</p>
                  <ul className="space-y-1">
                    {parsed.keyPoints.map((pt, i) => (
                      <li key={i} className="flex gap-1.5 text-xs text-foreground/80">
                        <span className="shrink-0 text-muted-foreground">•</span>
                        <span className="leading-snug">{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {parsed.followUps.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Suggested follow-ups</p>
                  <ul className="space-y-1">
                    {parsed.followUps.map((fu, i) => (
                      <li key={i} className="text-xs text-muted-foreground">• {fu}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  const relatedFollowUps = (note: Note) =>
    customer.tasks.filter(
      (task) =>
        !task.superseded &&
        task.source === "call" &&
        new Date(task.createdAt).getTime() >= new Date(note.createdAt).getTime()
    ).slice(0, 2);

  return (
    <div className="space-y-2.5 px-1">
      {customer.notes.map((note) => {
        const parsed = parseNoteBody(note.body);
        const moodMeta = parsed.mood ? getMoodMeta(parsed.mood) : null;
        const source = derivedNoteSource(note, noteActionById.get(note.id));
        const followUps = relatedFollowUps(note);
        return (
          <button
            key={note.id}
            type="button"
            onClick={() => onSelectNote(note)}
            className="glass-card w-full space-y-2 rounded-md p-3 text-left transition-colors hover:bg-white/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                {moodMeta && parsed.mood && (
                  <span className={cn("inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium", moodMeta.classes)}>
                    {moodMeta.emoji} {parsed.mood}
                  </span>
                )}
                <p className="text-xs font-semibold leading-snug text-foreground">{note.headline}</p>
              </div>
              <span className="shrink-0 text-[10px] text-muted-foreground">{shortDate(note.createdAt)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="rounded-xs bg-brand/10 px-1.5 py-0.5 text-[10px] text-brand">{source}</span>
            </div>
            {parsed.summary && (
              <p className="line-clamp-2 text-xs leading-relaxed text-foreground/80">{parsed.summary}</p>
            )}
            {parsed.keyPoints.length > 0 && (
              <ul className="space-y-0.5">
                {parsed.keyPoints.slice(0, 2).map((pt, i) => (
                  <li key={i} className="line-clamp-1 text-xs text-muted-foreground">• {pt}</li>
                ))}
              </ul>
            )}
            {followUps.length > 0 && (
              <div className="space-y-0.5">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Follow-ups</p>
                {followUps.map((task) => (
                  <p key={task.id} className="line-clamp-1 text-xs text-muted-foreground">
                    • {task.title}{task.dueDate ? ` · due ${shortDate(task.dueDate)}` : ""}
                  </p>
                ))}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function TaskPreviewRow({ task }: { task: Task }) {
  const qc = useQueryClient();
  const selectedId = useAgentStore((s) => s.selectedCustomerId);

  async function toggle() {
    try {
      await api.toggleTask(task.id, !task.done);
    } finally {
      if (selectedId) {
        void qc.invalidateQueries({ queryKey: ["customer", selectedId] });
        void qc.invalidateQueries({ queryKey: ["customers"] });
      }
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn("w-full rounded-sm border border-brand/8 bg-brand/5 p-2 text-left transition-colors hover:border-brand/20 hover:bg-brand/8", task.done && "opacity-70")}
    >
      <div className="flex items-start gap-2">
          <span
            className={cn(
              "mt-0.5 grid size-4 shrink-0 place-items-center rounded-xs border transition-colors",
              task.done
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-muted-foreground/40 bg-white/30"
            )}
          >
            {task.done && <CheckIcon className="size-3" />}
          </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            {!task.done && (
              <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", PRIORITY_DOT[task.priority])} />
            )}
            <p className={cn("min-w-0 text-xs font-medium leading-snug text-foreground", task.done && "text-muted-foreground line-through")}>
              {task.title}
            </p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {task.dueDate && (
              <span className="text-[10px] text-muted-foreground">due {shortDate(task.dueDate)}</span>
            )}
            {task.done && <span className="text-[10px] text-muted-foreground">completed</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

function TasksTab({ customer }: { customer: Customer | null }) {
  if (!customer || customer.tasks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-medium text-foreground/60">No tasks yet</p>
        <p className="max-w-[24ch] text-xs leading-relaxed text-muted-foreground">
          Confirm a suggested follow-up or ask Briefly to create one.
        </p>
      </div>
    );
  }

  const activeTasks = customer.tasks.filter((task) => !task.done && !task.superseded);
  const completedTasks = customer.tasks.filter((task) => task.done && !task.superseded);
  const supersededTasks = customer.tasks.filter((task) => task.superseded);

  return (
    <div className="space-y-3 px-1">
      {activeTasks.length > 0 && (
        <TaskGroup title="Active tasks" tasks={activeTasks} customerId={customer.id} />
      )}
      {completedTasks.length > 0 && (
        <TaskGroup title="Completed" tasks={completedTasks} customerId={customer.id} />
      )}
      {supersededTasks.length > 0 && (
        <TaskGroup title="Superseded" tasks={supersededTasks} customerId={customer.id} muted />
      )}
    </div>
  );
}

function TaskGroup({
  title,
  tasks,
  customerId,
  muted = false,
}: {
  title: string;
  tasks: Task[];
  customerId: string;
  muted?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 px-1">
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </span>
        <span className="rounded-xs bg-brand/10 px-1.5 text-[10px] font-semibold text-brand">
          {tasks.length}
        </span>
      </div>
      <div className="space-y-2">
        {tasks.map((task) => (
          <EditableTaskRow
            key={task.id}
            task={task}
            customerId={customerId}
            muted={muted}
          />
        ))}
      </div>
    </div>
  );
}

function EditableTaskRow({
  task,
  customerId,
  muted = false,
}: {
  task: Task;
  customerId: string;
  muted?: boolean;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    title: task.title,
    dueDate: task.dueDate ?? "",
    priority: task.priority,
  });
  const [saving, setSaving] = useState(false);

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["customer", customerId] }),
      qc.invalidateQueries({ queryKey: ["customers"] }),
    ]);
  }

  async function toggle() {
    await api.toggleTask(task.id, !task.done);
    await refresh();
  }

  async function save() {
    const title = draft.title.trim();
    if (!title) return;
    setSaving(true);
    try {
      await api.updateTask({ taskId: task.id, title, dueDate: draft.dueDate, priority: draft.priority });
      await refresh();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setDraft({ title: task.title, dueDate: task.dueDate ?? "", priority: task.priority });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="glass-card space-y-2 rounded-md p-2.5">
        <div className="flex items-center gap-1.5">
          {!task.done && !muted && (
            <span className={cn("size-1.5 shrink-0 rounded-full", PRIORITY_DOT[draft.priority])} />
          )}
          <Input
            value={draft.title}
            autoFocus
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            className="h-7 flex-1 bg-white/35 text-xs"
          />
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Input
            type="date"
            value={draft.dueDate}
            onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))}
            className="h-7 bg-white/35 text-xs"
          />
          <select
            value={draft.priority}
            onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value as Priority }))}
            className="h-7 rounded-sm border border-input bg-white/35 px-2 text-xs text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <option value="low">Low</option>
            <option value="med">Med</option>
            <option value="high">High</option>
          </select>
        </div>
        <div className="flex justify-end gap-1.5">
          <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={cancelEdit}>Cancel</Button>
          <Button type="button" size="sm" disabled={saving || !draft.title.trim()} onClick={save} className="h-6 px-2 text-xs">
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("group flex items-start gap-2 rounded-sm px-1 py-1.5 transition-colors hover:bg-white/30", (task.done || muted) && "opacity-60")}>
      <button
        type="button"
        disabled={muted}
        onClick={toggle}
        aria-label={task.done ? "Mark incomplete" : "Mark done"}
        className={cn(
          "mt-0.5 grid size-4 shrink-0 place-items-center rounded-xs border transition-colors",
          task.done ? "border-emerald-500 bg-emerald-500 text-white"
            : muted ? "border-muted/50 bg-muted/20"
            : "border-muted-foreground/40 bg-white/30 hover:border-brand"
        )}
      >
        {task.done && <CheckIcon className="size-3" />}
        {muted && !task.done && <XIcon className="size-3" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {!task.done && !muted && (
            <span className={cn("size-1.5 shrink-0 rounded-full", PRIORITY_DOT[task.priority])} />
          )}
          <span className={cn("truncate text-xs font-medium leading-tight", task.done && "line-through text-muted-foreground")}>
            {task.title}
          </span>
        </div>
        {(task.dueDate || task.priority) && (
          <div className="mt-0.5 flex items-center gap-1.5 pl-3.5">
            {task.dueDate && (
              <span className="text-[10px] text-muted-foreground">{shortDate(task.dueDate)}</span>
            )}
            <span className="text-[10px] capitalize text-muted-foreground">{task.priority}</span>
          </div>
        )}
      </div>

      {!muted && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-0.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          aria-label="Edit task"
        >
          <PencilIcon className="size-3 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}

const ACTION_ICONS = {
  search_customer: SearchIcon,
  get_customer_history: ClockIcon,
  save_note: StickyNoteIcon,
  update_note: PencilIcon,
  create_task: ListChecksIcon,
  create_customer: UserPlusIcon,
  save_call_context: FileTextIcon,
  generate_call_summary: StickyNoteIcon,
  get_call_context: FileTextIcon,
} as const;

function actionSummary(a: ActionEvent): string {
  const args = a.args as Record<string, unknown>;
  switch (a.name) {
    case "search_customer": return `"${String(args.query ?? "")}"`;
    case "create_customer": return `${String(args.name ?? "")} · ${String(args.company ?? "")}`;
    case "create_task": return String(args.title ?? "");
    case "save_note": return String(args.rawText ?? args.headline ?? "note").slice(0, 50);
    case "update_note": return String(args.headline ?? "note updated").slice(0, 50);
    case "save_call_context": return String(args.title ?? "transcript");
    case "generate_call_summary": return "post-call summary";
    case "get_customer_history":
    case "get_call_context":
      return "customer history";
    default: return "";
  }
}

function ActionRow({ action }: { action: ActionEvent }) {
  const [open, setOpen] = useState(false);
  const Icon = ACTION_ICONS[action.name as keyof typeof ACTION_ICONS] ?? SearchIcon;

  return (
    <div className={cn("glass rounded-md text-sm transition-colors", action.superseded && "opacity-50")}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-xs bg-muted text-foreground/80">
          <Icon className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("font-mono text-xs", action.superseded && "line-through")}>
            {action.name}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{actionSummary(action)}</span>
        </span>
        {action.superseded ? (
          <span className="rounded-xs bg-muted border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">superseded</span>
        ) : action.status === "pending" ? (
          <Loader2Icon className="size-3.5 shrink-0 animate-spin text-amber-600" />
        ) : action.status === "error" ? (
          <span className="grid size-4 shrink-0 place-items-center rounded-full bg-rose-100 text-rose-700">
            <XIcon className="size-2.5" />
          </span>
        ) : (
          <span className="grid size-4 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckIcon className="size-2.5" />
          </span>
        )}
        <ChevronDownIcon className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-2 px-3 pb-3">
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Args</p>
                <pre className="thin-scroll max-h-32 overflow-auto rounded-lg bg-muted/60 p-2 font-mono text-[10px] leading-relaxed">
                  {JSON.stringify(action.args, null, 2)}
                </pre>
              </div>
              {action.error && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Error</p>
                  <pre className="rounded-lg bg-rose-50/70 p-2 font-mono text-[10px] text-rose-700">{action.error}</pre>
                </div>
              )}
              {action.result !== undefined && !action.error && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Result</p>
                  <pre className="thin-scroll max-h-32 overflow-auto rounded-lg bg-muted/60 p-2 font-mono text-[10px] leading-relaxed">
                    {JSON.stringify(action.result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
