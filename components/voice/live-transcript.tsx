"use client";

import { useRef, useState } from "react";
import { motion } from "motion/react";
import {
  CheckIcon,
  CheckSquareIcon,
  Loader2Icon,
  MicIcon,
  PencilIcon,
  TargetIcon,
  XIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ui/conversation";
import { Message, MessageContent } from "@/components/ui/message";
import { useAgentStore } from "@/lib/agent-store";
import { cn } from "@/lib/utils";
import type { DealBrief, TranscriptTurn } from "@/lib/types";

/** The conversation surface only — the command bar lives in CommandBar. */
export function LiveTranscript({
  live,
  onEditTurn,
}: {
  live: boolean;
  onEditTurn: (id: string, text: string) => void;
}) {
  const transcript = useAgentStore((s) => s.transcript);
  const dealBrief = useAgentStore((s) => s.dealBrief);
  const dealBriefAt = useAgentStore((s) => s.dealBriefAt);
  const briefLoading = useAgentStore((s) => s.briefLoading);
  const timeline = [
    ...transcript.map((turn) => ({
      type: "turn" as const,
      id: turn.id,
      at: turn.at,
      turn,
    })),
  ].sort((a, b) => a.at - b.at);

  return (
    <Conversation className="h-full overflow-hidden" initial="smooth" resize="smooth">
      <ConversationContent className="space-y-1 overflow-hidden px-3 py-2 pr-5 sm:px-4 sm:pr-6">
        {/* Empty state only when there's nothing to show at all */}
        {transcript.length === 0 && !dealBrief && !briefLoading && !live && (
          <ConversationEmptyState
            className="h-full"
            icon={<MicIcon className="size-7 text-muted-foreground/30" />}
            title="No transcript yet"
            description="Import a transcript to create a grounded brief."
          />
        )}

        {timeline.map((item) =>
          item.turn.brief ? (
            <TalkingPointsMessage key={item.id} brief={item.turn.brief} />
          ) : (
            <Bubble key={item.id} turn={item.turn} onSave={onEditTurn} />
          )
        )}

        {/* Talking points loading */}
        {briefLoading && (
          <div className="flex items-center gap-2.5 rounded-lg border border-brand/10 bg-white/35 px-4 py-3 mr-auto max-w-[75%]">
            <Loader2Icon className="size-3.5 animate-spin text-brand shrink-0" />
            <p className="text-xs text-muted-foreground">Generating talking points…</p>
          </div>
        )}

      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}

function TalkingPointsMessage({ brief }: { brief: DealBrief }) {
  return (
    <div className="mr-auto w-full max-w-[75%] px-1">
      <div className="mb-1 flex items-center gap-1.5 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Co-pilot
      </div>
      <DealBriefCard brief={brief} />
    </div>
  );
}

function Bubble({
  turn,
  onSave,
}: {
  turn: TranscriptTurn;
  onSave: (id: string, text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const turnText = (turn.content ?? turn.text).replace(/\s+/g, " ").trim();
  const [draft, setDraft] = useState(turnText);
  const ref = useRef<HTMLTextAreaElement>(null);
  const from = turn.role === "user" ? "user" : "assistant";
  const isUser = from === "user";
  const lowConf = turn.confidence < 0.85;

  function startEdit() {
    setDraft(turnText);
    setEditing(true);
    window.requestAnimationFrame(() => ref.current?.focus());
  }

  function save() {
    const next = draft.trim();
    if (!next) return;
    onSave(turn.id, next);
    setEditing(false);
  }

  function cancel() {
    setDraft(turnText);
    setEditing(false);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-1"
    >
      <Message from={from} className="overflow-hidden px-1">
        <div
          className={cn(
            "flex min-w-0 flex-col gap-1",
            isUser
              ? "ml-auto max-w-[65%] items-end"
              : "mr-auto w-full max-w-[75%] items-start"
          )}
        >
          <div
            className={cn(
              "flex max-w-full items-center gap-1.5 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground",
              isUser ? "justify-end text-right" : "justify-start"
            )}
          >
            {isUser ? "You" : "Co-pilot"}
            {turn.edited && (
              <Badge variant="secondary" className="h-3.5 px-1 text-[8px] uppercase">
                edited
              </Badge>
            )}
            {lowConf && isUser && (
              <span
                title={`Low confidence (${Math.round(turn.confidence * 100)}%) — tap to correct`}
                className="size-1.5 rounded-full bg-amber-400"
              />
            )}
          </div>

          {editing && isUser ? (
            <div className="flex w-[min(28rem,65vw)] min-w-0 flex-col items-end gap-1.5">
              <Textarea
                ref={ref}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    save();
                  }
                  if (event.key === "Escape") cancel();
                }}
                rows={2}
                className="max-h-32 min-h-16 w-full resize-none rounded-2xl border-brand/20 bg-white/60 pr-3 text-sm focus-visible:ring-brand/20"
              />
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={cancel}
                  className="inline-flex h-6 items-center gap-1 rounded-xs px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-white/45 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                >
                  <XIcon className="size-3" />
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={!draft.trim()}
                  className="inline-flex h-6 items-center gap-1 rounded-xs border border-brand/10 bg-white px-2 text-xs font-medium text-brand shadow-[0_2px_8px_rgba(59,73,234,0.08)] transition-colors hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 disabled:pointer-events-none disabled:opacity-50"
                >
                  <CheckIcon className="size-3" />
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "flex max-w-full items-start gap-1.5",
                isUser ? "self-end" : "self-start"
              )}
            >
              {isUser && (
                <button
                  type="button"
                  onClick={startEdit}
                  aria-label="Edit message"
                  className="order-first mt-1 grid size-6 shrink-0 place-items-center rounded-xs text-muted-foreground opacity-75 transition-colors hover:bg-white/45 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                >
                  <PencilIcon className="size-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => isUser && startEdit()}
                className={cn(
                  "group w-fit min-w-0 max-w-[calc(100%-1.875rem)] rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
                  lowConf && isUser && "ring-1 ring-amber-400/40"
                )}
              >
                <MessageContent
                  from={from}
                  className={cn(
                    "block min-w-0 max-w-full",
                    !isUser && "shadow-[0_2px_6px_rgba(0,0,0,0.02)]"
                  )}
                >
                  <span className="block min-w-0 whitespace-pre-wrap break-words leading-relaxed">
                    {turnText}
                  </span>
                </MessageContent>
              </button>
            </div>
          )}
        </div>
      </Message>
    </motion.div>
  );
}

function DealBriefCard({ brief }: { brief: DealBrief }) {
  return (
    <div className="space-y-3 rounded-lg border border-brand/10 bg-zinc-900/82 px-4 py-3.5 text-white/90 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <TargetIcon className="size-3.5 shrink-0 text-white/50" />
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">
          Talking points — {brief.customerName}
        </p>
      </div>

      <p className="text-xs text-white/70 leading-relaxed border-b border-white/5 pb-2">
        Here is your talking points brief for {brief.customerName} to help guide your next conversation.
      </p>

      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
          What to lead with
        </p>
        <p className="text-xs leading-relaxed text-white/85">{brief.leadWith}</p>
      </div>

      {brief.customerConcern.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
            Customer concerns
          </p>
          <ul className="space-y-1">
            {brief.customerConcern.map((item, i) => (
              <li key={i} className="flex gap-2 text-xs text-white/75">
                <span className="mt-0.5 shrink-0 text-white/30">•</span>
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {brief.likelyObjection.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
            Likely objections
          </p>
          <ul className="space-y-1">
            {brief.likelyObjection.map((item, i) => (
              <li key={i} className="flex gap-2 text-xs text-white/75">
                <span className="mt-0.5 shrink-0 text-amber-400/70">!</span>
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-sm border border-white/8 bg-white/6 px-3 py-2.5">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
          Talk track
        </p>
        <p className="text-xs leading-relaxed text-white/80">{brief.suggestedTalkTrack}</p>
      </div>

      <div className="flex items-start gap-2 rounded-sm border border-white/8 bg-white/6 px-3 py-2.5">
        <CheckSquareIcon className="mt-0.5 size-3.5 shrink-0 text-white/50" />
        <div className="min-w-0">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
            Recommended next step
          </p>
          <p className="text-xs leading-relaxed text-white/80">{brief.recommendedNextStep}</p>
        </div>
      </div>
    </div>
  );
}
