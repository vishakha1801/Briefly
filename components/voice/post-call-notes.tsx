"use client";

import { useState } from "react";
import { motion } from "motion/react";
import {
  CheckSquareIcon,
  Loader2Icon,
  PencilIcon,
  SaveIcon,
  StickyNoteIcon,
  TrashIcon,
} from "lucide-react";
import { useAgentStore } from "@/lib/agent-store";
import { shortDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { StructuredNote } from "@/lib/types";

const EMPTY_DRAFT: StructuredNote = {
  mood: "",
  title: "",
  summary: "",
  keyPoints: [],
  suggestedFollowUps: [],
};

const MOOD_META: Record<string, { emoji: string; classes: string }> = {
  positive: {
    emoji: "😊",
    classes: "bg-emerald-50/80 text-emerald-700 border-emerald-200/60",
  },
  "high intent": {
    emoji: "🔥",
    classes: "bg-orange-50/80 text-orange-700 border-orange-200/60",
  },
  cautious: {
    emoji: "⚠️",
    classes: "bg-amber-50/80 text-amber-700 border-amber-200/60",
  },
  neutral: {
    emoji: "😐",
    classes: "bg-zinc-50/80 text-zinc-500 border-zinc-200/60",
  },
  mixed: {
    emoji: "〰️",
    classes: "bg-violet-50/80 text-violet-700 border-violet-200/60",
  },
};

function moodMeta(mood: string) {
  return (
    MOOD_META[mood.toLowerCase()] ?? {
      emoji: "📋",
      classes: "bg-white/40 text-muted-foreground border-brand/10",
    }
  );
}

export function PostCallNotes({
  onSaveNote,
  onUpdateDraft,
  onCreateFollowUp,
}: {
  onSaveNote: () => void;
  onUpdateDraft: (draft: StructuredNote | null) => void;
  onCreateFollowUp: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const actions = useAgentStore((s) => s.actions);
  const status = useAgentStore((s) => s.status);
  const draft = useAgentStore((s) => s.postCallDraft);
  const loading = useAgentStore((s) => s.postCallLoading);

  const capturedNotes = actions
    .filter((a) => a.name === "save_note" && a.status === "success" && !a.superseded)
    .map((a) => a.result as { headline?: string; body?: string; id?: string });

  const capturedTasks = actions
    .filter((a) => a.name === "create_task" && a.status === "success" && !a.superseded)
    .map((a) => a.result as { title?: string; dueDate?: string; id?: string });

  function patch(p: Partial<StructuredNote>) {
    onUpdateDraft({ ...EMPTY_DRAFT, ...draft, ...p });
  }

  function patchList(key: "keyPoints" | "suggestedFollowUps", raw: string) {
    patch({
      [key]: raw
        .split("\n")
        .map((line) => line.replace(/^[-•]\s*/, "").trim())
        .filter(Boolean),
    });
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2Icon className="size-6 animate-spin text-brand" />
          <p className="text-sm font-medium text-foreground">Drafting post-call notes…</p>
        </div>
      </div>
    );
  }

  // ── Draft review ───────────────────────────────────────────────────────────
  if (draft) {
    const note = { ...EMPTY_DRAFT, ...draft };
    const meta = moodMeta(note.mood ?? "");

    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="thin-scroll h-full overflow-y-auto p-4 sm:p-5"
      >
        <div className="mx-auto max-w-2xl space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Review post-call note
            </h2>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onUpdateDraft(null)}
                className="h-8 gap-1.5 rounded-sm text-xs text-muted-foreground hover:text-rose-500"
              >
                <TrashIcon className="size-3.5" />
                Discard
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditing((e) => !e)}
                className={cn(
                  "h-8 gap-1.5 rounded-sm text-xs",
                  editing && "bg-white/45 text-brand"
                )}
              >
                <PencilIcon className="size-3.5" />
                {editing ? "Done editing" : "Edit"}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={onSaveNote}
                className="h-8 gap-1.5 rounded-sm bg-brand text-xs hover:bg-brand/90"
              >
                <SaveIcon className="size-3.5" />
                Save note
              </Button>
            </div>
          </div>

          {/* Note card */}
          <div className="rounded-md border border-brand/10 bg-white/35 p-4 space-y-4">
            {/* Mood */}
            <div>
              {editing ? (
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Mood
                  </label>
                  <Input
                    value={note.mood ?? ""}
                    onChange={(e) => patch({ mood: e.target.value })}
                    placeholder="Positive / Neutral / Cautious / High intent"
                    className="h-8 bg-white/45 text-sm"
                  />
                </div>
              ) : note.mood ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs font-medium",
                    meta.classes
                  )}
                >
                  {meta.emoji} {note.mood}
                </span>
              ) : null}
            </div>

            {/* Title */}
            <div>
              {editing ? (
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Title
                  </label>
                  <Input
                    value={note.title ?? ""}
                    onChange={(e) => patch({ title: e.target.value })}
                    className="h-8 bg-white/45 text-sm font-medium"
                  />
                </div>
              ) : (
                <p className="text-sm font-semibold leading-snug text-foreground">
                  {note.title || "Untitled note"}
                </p>
              )}
            </div>

            {/* Summary */}
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Summary
              </p>
              {editing ? (
                <Textarea
                  value={note.summary ?? ""}
                  onChange={(e) => patch({ summary: e.target.value })}
                  rows={4}
                  className="resize-none bg-white/45 text-sm leading-relaxed"
                />
              ) : (
                <p className="text-xs leading-relaxed text-foreground/80">
                  {note.summary || "No summary."}
                </p>
              )}
            </div>

            {/* Key points */}
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Key points
              </p>
              {editing ? (
                <Textarea
                  value={(note.keyPoints ?? []).join("\n")}
                  onChange={(e) => patchList("keyPoints", e.target.value)}
                  rows={5}
                  placeholder="One point per line"
                  className="resize-none bg-white/45 text-sm leading-relaxed"
                />
              ) : (
                <ul className="space-y-1.5">
                  {(note.keyPoints ?? []).map((point, i) => (
                    <li key={i} className="flex gap-2 text-xs text-foreground/80">
                      <span className="mt-0.5 shrink-0 text-muted-foreground">•</span>
                      <span className="leading-relaxed">{point}</span>
                    </li>
                  ))}
                  {!note.keyPoints?.length && (
                    <li className="text-xs text-muted-foreground italic">No key points.</li>
                  )}
                </ul>
              )}
            </div>

            {/* Suggested follow-ups */}
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Suggested follow-ups
              </p>
              {editing ? (
                <Textarea
                  value={(note.suggestedFollowUps ?? []).join("\n")}
                  onChange={(e) => patchList("suggestedFollowUps", e.target.value)}
                  rows={3}
                  placeholder="One follow-up per line"
                  className="resize-none bg-white/45 text-sm leading-relaxed"
                />
              ) : (
                <div className="space-y-1.5">
                  {(note.suggestedFollowUps ?? []).map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-3 rounded-sm border border-brand/8 bg-brand/5 px-2.5 py-2"
                    >
                      <p className="min-w-0 text-xs leading-snug text-foreground/80">{item}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onCreateFollowUp(item)}
                        className="h-7 shrink-0 gap-1 rounded-sm px-2 text-[11px]"
                      >
                        <CheckSquareIcon className="size-3" />
                        Create task
                      </Button>
                    </div>
                  ))}
                  {!note.suggestedFollowUps?.length && (
                    <p className="text-xs text-muted-foreground italic">No follow-ups suggested.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── Empty / saved state ────────────────────────────────────────────────────
  const isEmpty = capturedNotes.length === 0 && capturedTasks.length === 0;

  if (isEmpty) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <StickyNoteIcon className="size-8 text-muted-foreground/30" />
          <h3 className="text-sm font-semibold text-foreground/80">No post-call notes yet</h3>
          <p className="max-w-[36ch] text-xs leading-relaxed text-muted-foreground">
            {status === "live"
              ? "Add a transcript or recap, then generate post-call notes for review."
              : "Start a session, add call context, then generate post-call notes."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="thin-scroll h-full overflow-y-auto p-4 sm:p-5"
    >
      <div className="mx-auto max-w-2xl space-y-4">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          Post-call notes
        </h2>

        {capturedNotes.map((note, i) => (
          <SavedNoteCard key={note?.id ?? i} note={note} />
        ))}

        {capturedTasks.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Confirmed follow-ups
            </p>
            {capturedTasks.map((task, i) => (
              <div
                key={task?.id ?? i}
                className="flex items-center gap-3 rounded-sm border border-brand/8 bg-brand/5 px-3 py-2"
              >
                <CheckSquareIcon className="size-3.5 shrink-0 text-brand" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{task?.title}</p>
                  {task?.dueDate && (
                    <p className="text-[10px] text-muted-foreground">Due {shortDate(task.dueDate)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function SavedNoteCard({
  note,
}: {
  note: { headline?: string; body?: string; id?: string };
}) {
  const parsedMood = note.body?.match(/^Mood:\s*(.+)/m)?.[1]?.trim() ?? "";
  const parsedSummary =
    note.body?.match(/Summary:\n([\s\S]*?)(?:\n\nKey points:|\n\nSuggested follow-ups:|$)/)?.[1]?.trim() ?? "";
  const meta = moodMeta(parsedMood);

  return (
    <div className="glass-card space-y-2.5 rounded-md p-3">
      {parsedMood && (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[11px] font-medium",
            meta.classes
          )}
        >
          {meta.emoji} {parsedMood}
        </span>
      )}
      <h4 className="text-xs font-semibold text-foreground">
        {note?.headline ?? "Note saved"}
      </h4>
      {parsedSummary && (
        <p className="text-xs leading-relaxed text-muted-foreground">{parsedSummary}</p>
      )}
    </div>
  );
}
