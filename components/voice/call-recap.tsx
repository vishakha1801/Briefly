"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckSquareIcon,
  ChevronDownIcon,
  FileAudioIcon,
  MicIcon,
  PencilIcon,
  UploadIcon,
} from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAgentStore } from "@/lib/agent-store";

import { useCallContexts, useCustomer } from "@/lib/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { ingestCallRecap } from "@/lib/call-recap-ingest";
import { api } from "@/lib/api";
import { shortDate } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type InlineView = "none" | "typing" | "dictating" | "mp3" | "editing";
type DictateStatus = "idle" | "listening" | "review";
type Mp3Status = "idle" | "transcribing" | "review";

export function CallRecap({
  onImportTranscript,
  onGeneratePostCallNotes,
  onCreateFollowUp,
}: {
  onImportTranscript: () => void;
  onGeneratePostCallNotes: () => void;
  onCreateFollowUp: (title: string) => void;
}) {
  const [inlineView, setInlineView] = useState<InlineView>("none");
  const [saving, setSaving] = useState(false);

  // Shared draft for typing / editing views
  const [draft, setDraft] = useState("");

  // Dictation
  const [dictateStatus, setDictateStatus] = useState<DictateStatus>("idle");
  const [dictateDraft, setDictateDraft] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dictateRecRef = useRef<any>(null);

  // MP3
  const [mp3Status, setMp3Status] = useState<Mp3Status>("idle");
  const [mp3Draft, setMp3Draft] = useState("");
  const [mp3FileName, setMp3FileName] = useState("");
  const mp3InputRef = useRef<HTMLInputElement>(null);

  const selectedCustomerId = useAgentStore((s) => s.selectedCustomerId);
  const recapAction = useAgentStore((s) => s.recapAction);
  const qc = useQueryClient();
  const { data: contexts = [] } = useCallContexts(selectedCustomerId ?? "");
  const { data: customer } = useCustomer(selectedCustomerId ?? "");

  const latestContext = contexts[0];
  const latestNote = customer?.notes[0];

  // Parse note body — handles new (Mood:/Key points:) and legacy formats
  const noteBody = latestNote?.body ?? "";
  const isNewFormat = /^Mood:/m.test(noteBody);
  const summary = isNewFormat
    ? noteBody.match(/Summary:\n([\s\S]*?)(?:\n\nKey points:|\n\nSuggested follow-ups:|$)/)?.[1]?.trim()
    : noteBody.match(/Summary:\n([\s\S]*?)(?:\n\n[A-Z][A-Za-z /-]+:\n|$)/)?.[1]?.trim();
  const keyPoints = isNewFormat
    ? (noteBody
        .match(/Key points:\n([\s\S]*?)(?:\n\nSuggested follow-ups:|\n\n|$)/)?.[1]
        ?.split(/\r?\n/).map((l) => l.replace(/^[•-]\s*/, "").trim()).filter(Boolean).slice(0, 3) ?? [])
    : (noteBody
        .match(/(?:Pain points|Key points):\n([\s\S]*?)(?:\n\n[A-Z][A-Za-z /-]+:\n|$)/)?.[1]
        ?.split(/\r?\n/).map((l) => l.replace(/^[-•]\s*/, "").trim()).filter(Boolean).slice(0, 3) ?? []);
  const nextStep = isNewFormat
    ? (noteBody
        .match(/Suggested follow-ups:\n([\s\S]*?)(?:\n\n|$)/)?.[1]
        ?.split(/\r?\n/).map((l) => l.replace(/^[•-]\s*/, "").trim()).filter(Boolean)[0] ?? "")
    : (noteBody
        .match(/(?:Suggested follow-ups|Next steps):\n([\s\S]*?)(?:\n\n[A-Z][A-Za-z /-]+:\n|$)/)?.[1]
        ?.split(/\r?\n/).map((l) => l.replace(/^[-•]\s*/, "").trim()).filter(Boolean)[0] ?? "");
  const hasContext = contexts.length > 0;

  // Auto-open a specific inline view when navigated here from suggestion chips.
  useEffect(() => {
    if (!recapAction) return;
    useAgentStore.getState().consumeRecapAction();
    if (recapAction === "dictate") startDictating();
    else if (recapAction === "type") { setDraft(""); setInlineView("typing"); }
  // startDictating is stable (no deps that change), intentionally excluded
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recapAction]);

  function resetInline() {
    dictateRecRef.current?.abort();
    dictateRecRef.current = null;
    setInlineView("none");
    setDraft("");
    setDictateStatus("idle");
    setDictateDraft("");
    setMp3Status("idle");
    setMp3Draft("");
    setMp3FileName("");
  }

  async function saveRecap(text: string, title: string) {
    if (!text.trim()) return;
    if (!selectedCustomerId) {
      toast.error("Select a customer first");
      return;
    }
    setSaving(true);
    try {
      await ingestCallRecap({
        customerId: selectedCustomerId,
        title,
        transcript: text.trim(),
        callDate: new Date().toISOString().split("T")[0],
        qc,
      });
      resetInline();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  // ── Dictation ──────────────────────────────────────────────────────────────
  function startDictating() {
    setInlineView("dictating");
    setDictateStatus("listening");
    setDictateDraft("");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.message("Browser speech not available — use 'Type call notes' instead.");
      setDictateStatus("review");
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let out = "";
      for (let i = 0; i < e.results.length; i++) out += e.results[i][0].transcript;
      setDictateDraft(out.replace(/\s+/g, " ").trimStart());
    };
    rec.onend = () => {
      setDictateStatus("review");
      dictateRecRef.current = null;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      if (e.error !== "no-speech" && e.error !== "aborted")
        toast.error(`Mic error: ${e.error}`);
      setDictateStatus("review");
      dictateRecRef.current = null;
    };
    try {
      rec.start();
      dictateRecRef.current = rec;
    } catch {
      setDictateStatus("review");
    }
  }

  function stopDictating() {
    dictateRecRef.current?.stop();
    dictateRecRef.current = null;
  }

  // ── MP3 upload ─────────────────────────────────────────────────────────────
  async function handleMp3File(file: File) {
    setMp3FileName(file.name);
    setMp3Status("transcribing");
    try {
      const result = await api.transcribeAudio(file);
      setMp3Draft(result.transcript);
      setMp3Status("review");
    } catch {
      toast.error("Transcription failed");
      setMp3Status("idle");
    }
  }

  return (
    <div className="thin-scroll h-full overflow-y-auto p-4 sm:p-5">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Call recap</h2>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onImportTranscript}
              className="h-8 gap-1.5 rounded-sm px-3 text-xs"
            >
              <UploadIcon className="size-3.5" />
              Import
            </Button>

            <DropdownMenuPrimitive.Root>
              <DropdownMenuPrimitive.Trigger asChild>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5 rounded-sm bg-brand px-3 text-xs hover:bg-brand/90"
                >
                  Manual add
                  <ChevronDownIcon className="size-3.5" />
                </Button>
              </DropdownMenuPrimitive.Trigger>
              <DropdownMenuPrimitive.Portal>
                <DropdownMenuPrimitive.Content
                  align="end"
                  sideOffset={5}
                  className="z-50 min-w-[190px] overflow-hidden rounded-md border border-brand/10 bg-white/95 p-1 shadow-[0_8px_24px_rgba(16,20,63,0.12)] backdrop-blur-sm"
                >
                  <DropdownMenuPrimitive.Item
                    onSelect={startDictating}
                    className="flex cursor-pointer items-center gap-2.5 rounded-xs px-3 py-2 text-sm text-foreground outline-none data-[highlighted]:bg-brand/8"
                  >
                    <MicIcon className="size-3.5 text-brand" />
                    Dictate recap
                  </DropdownMenuPrimitive.Item>
                  <DropdownMenuPrimitive.Item
                    onSelect={() => {
                      setInlineView("mp3");
                      setMp3Status("idle");
                      // slight delay so the view mounts before we click
                      setTimeout(() => mp3InputRef.current?.click(), 50);
                    }}
                    className="flex cursor-pointer items-center gap-2.5 rounded-xs px-3 py-2 text-sm text-foreground outline-none data-[highlighted]:bg-brand/8"
                  >
                    <FileAudioIcon className="size-3.5 text-brand" />
                    Upload MP3
                  </DropdownMenuPrimitive.Item>
                  <DropdownMenuPrimitive.Item
                    onSelect={() => {
                      setDraft("");
                      setInlineView("typing");
                    }}
                    className="flex cursor-pointer items-center gap-2.5 rounded-xs px-3 py-2 text-sm text-foreground outline-none data-[highlighted]:bg-brand/8"
                  >
                    <PencilIcon className="size-3.5 text-brand" />
                    Type call notes
                  </DropdownMenuPrimitive.Item>
                </DropdownMenuPrimitive.Content>
              </DropdownMenuPrimitive.Portal>
            </DropdownMenuPrimitive.Root>
          </div>
        </div>

        {/* Hidden MP3 file input */}
        <input
          ref={mp3InputRef}
          type="file"
          accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleMp3File(file);
            e.target.value = "";
          }}
        />

        {/* ── Inline: Type call notes ── */}
        {inlineView === "typing" && (
          <InlinePanel label="Type call notes" onCancel={resetInline}>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add rough notes about what happened on the call…"
              rows={5}
              autoFocus
              className="resize-y bg-white/45 text-sm leading-relaxed"
            />
            <PanelActions
              onCancel={resetInline}
              onSave={() => saveRecap(draft, "Manual notes")}
              saveLabel="Save notes"
              disabled={!draft.trim() || saving}
              saving={saving}
            />
          </InlinePanel>
        )}

        {/* ── Inline: Dictate recap ── */}
        {inlineView === "dictating" && (
          <InlinePanel
            label="Dictate recap"
            labelRight={
              dictateStatus === "listening" ? (
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-brand" />
                  </span>
                  Recording
                </span>
              ) : null
            }
            onCancel={resetInline}
          >
            {dictateStatus === "listening" ? (
              <div className="flex flex-col items-center gap-3 rounded-sm bg-brand/5 py-8">
                <p className="text-xs text-muted-foreground">Speak your recap…</p>
                {dictateDraft && (
                  <p className="max-w-md px-4 text-center text-sm leading-relaxed text-foreground/70">
                    {dictateDraft}
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={stopDictating}
                  className="rounded-sm"
                >
                  Stop recording
                </Button>
              </div>
            ) : (
              <Textarea
                value={dictateDraft}
                onChange={(e) => setDictateDraft(e.target.value)}
                placeholder="Your dictated recap will appear here…"
                rows={5}
                autoFocus={dictateStatus === "review"}
                className="resize-y bg-white/45 text-sm leading-relaxed"
              />
            )}
            <PanelActions
              onCancel={resetInline}
              onSave={() => saveRecap(dictateDraft, "Dictated recap")}
              saveLabel="Save recap"
              disabled={!dictateDraft.trim() || saving || dictateStatus === "listening"}
              saving={saving}
            />
          </InlinePanel>
        )}

        {/* ── Inline: MP3 upload ── */}
        {inlineView === "mp3" && (
          <InlinePanel label="Upload MP3" onCancel={resetInline}>
            {mp3Status === "idle" && (
              <div className="flex flex-col items-center gap-3 rounded-sm bg-brand/5 py-10">
                <FileAudioIcon className="size-8 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">Select an audio file to transcribe</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => mp3InputRef.current?.click()}
                  className="rounded-sm"
                >
                  Choose file
                </Button>
              </div>
            )}
            {mp3Status === "transcribing" && (
              <div className="flex flex-col items-center gap-2 py-10">
                <p className="text-sm font-medium text-foreground/70">{mp3FileName}</p>
                <p className="text-xs text-muted-foreground">Transcribing audio…</p>
              </div>
            )}
            {mp3Status === "review" && (
              <Textarea
                value={mp3Draft}
                onChange={(e) => setMp3Draft(e.target.value)}
                rows={6}
                autoFocus
                className="resize-y bg-white/45 text-sm leading-relaxed"
              />
            )}
            <PanelActions
              onCancel={resetInline}
              onSave={() => saveRecap(mp3Draft, "MP3 transcription")}
              saveLabel="Save transcript"
              disabled={!mp3Draft.trim() || saving || mp3Status !== "review"}
              saving={saving}
            />
          </InlinePanel>
        )}

        {/* ── Inline: Edit recap ── */}
        {inlineView === "editing" && (
          <InlinePanel label="Edit recap" onCancel={resetInline}>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={7}
              autoFocus
              className="resize-y bg-white/45 text-sm leading-relaxed"
            />
            <PanelActions
              onCancel={resetInline}
              onSave={() => saveRecap(draft, latestContext?.title ?? "Edited recap")}
              saveLabel="Save"
              disabled={!draft.trim() || saving}
              saving={saving}
            />
          </InlinePanel>
        )}

        {/* ── Empty state ── */}
        {!hasContext && inlineView === "none" && (
          <div className="flex flex-col items-center gap-2 rounded-md border border-brand/8 bg-white/20 py-14 text-center">
            <p className="text-sm font-medium text-foreground/70">No recap yet</p>
            <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
              Import an existing transcript, or use Manual add to capture what happened on the call.
            </p>
          </div>
        )}

        {/* ── Recap content ── */}
        {hasContext && inlineView === "none" && (
          <div className="space-y-4 rounded-md border border-brand/10 bg-white/35 p-4">
            {/* Meta */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <p className="truncate text-sm font-semibold text-foreground">
                  {latestContext?.title ?? "Call recap"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {latestContext?.callDate
                    ? shortDate(latestContext.callDate)
                    : latestContext?.createdAt
                      ? shortDate(latestContext.createdAt)
                      : "No date"}
                </p>
              </div>
              <span className="shrink-0 rounded-xs border border-brand/12 bg-brand/8 px-2 py-1 text-[10px] font-medium text-brand">
                {contexts.length} source{contexts.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Summary */}
            {summary && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Summary
                </p>
                <p className="text-xs leading-relaxed text-foreground/80">{summary}</p>
              </div>
            )}

            {/* Key points */}
            {keyPoints.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Key points
                </p>
                <ul className="space-y-1">
                  {keyPoints.map((point) => (
                    <li key={point} className="text-xs text-muted-foreground">
                      • {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Suggested next step */}
            {nextStep && (
              <div className="rounded-sm border border-brand/8 bg-brand/5 p-2.5">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Suggested next step
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="min-w-0 text-xs text-foreground/80">{nextStep}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onCreateFollowUp(nextStep)}
                    className="h-7 shrink-0 gap-1.5 rounded-sm px-2 text-xs"
                  >
                    <CheckSquareIcon className="size-3.5" />
                    Add task
                  </Button>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setDraft(latestContext?.transcript ?? "");
                  setInlineView("editing");
                }}
                className="h-8 gap-1.5 rounded-sm text-xs"
              >
                <PencilIcon className="size-3.5" />
                Edit recap
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={onGeneratePostCallNotes}
                className="h-8 rounded-sm bg-brand hover:bg-brand/90"
              >
                Generate post-call notes
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function InlinePanel({
  label,
  labelRight,
  onCancel,
  children,
}: {
  label: string;
  labelRight?: React.ReactNode;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-card space-y-2.5 rounded-md p-3.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </p>
        {labelRight}
      </div>
      {children}
    </div>
  );
}

function PanelActions({
  onCancel,
  onSave,
  saveLabel,
  disabled,
  saving,
}: {
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
  disabled: boolean;
  saving: boolean;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onCancel}
        className="rounded-sm text-muted-foreground hover:bg-white/45 hover:text-foreground"
      >
        Cancel
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={onSave}
        disabled={disabled}
        className={cn(
          "rounded-sm bg-brand hover:bg-brand/90",
          disabled && "opacity-60"
        )}
      >
        {saving ? "Saving…" : saveLabel}
      </Button>
    </div>
  );
}
