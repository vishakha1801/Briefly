"use client";

import { MicIcon, PencilIcon, TargetIcon, UploadIcon } from "lucide-react";
import { useAgentStore } from "@/lib/agent-store";
import { cn } from "@/lib/utils";

export function ContextPrompts({
  onDealBrief,
  onImportTranscript,
}: {
  onDealBrief?: () => void;
  onImportTranscript: () => void;
}) {
  const briefNeedsContext = useAgentStore((s) => s.briefNeedsContext);

  if (!onDealBrief) return null;

  function handleDealBrief() {
    useAgentStore.getState().setBriefNeedsContext(false);
    onDealBrief?.();
  }

  function handleRecordRecap() {
    useAgentStore.getState().setBriefNeedsContext(false);
    useAgentStore.getState().openRecap("dictate");
  }

  function handleImportTranscript() {
    useAgentStore.getState().setBriefNeedsContext(false);
    useAgentStore.getState().openRecap();
    onImportTranscript();
  }

  function handleTypeNotes() {
    useAgentStore.getState().setBriefNeedsContext(false);
    useAgentStore.getState().openRecap("type");
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={handleDealBrief}
        title="Or say 'get talking points'"
        className="glass-chip flex h-7 items-center gap-1.5 rounded-sm px-3 text-xs font-medium text-muted-foreground shadow-sm transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/25"
      >
        <TargetIcon className="size-3" />
        Get talking points
      </button>

      {/* Suggestion chips — only shown when last attempt had no context */}
      <div
        className={cn(
          "flex flex-wrap items-center justify-center gap-1 transition-all duration-200",
          briefNeedsContext ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        aria-hidden={!briefNeedsContext}
      >
        <span className="w-full text-center text-[9px] font-medium uppercase tracking-widest text-muted-foreground/60">
          Add context first
        </span>
        <SuggestionChip icon={<MicIcon className="size-2.5" />} onClick={handleRecordRecap}>
          Record recap
        </SuggestionChip>
        <SuggestionChip icon={<UploadIcon className="size-2.5" />} onClick={handleImportTranscript}>
          Import transcript
        </SuggestionChip>
        <SuggestionChip icon={<PencilIcon className="size-2.5" />} onClick={handleTypeNotes}>
          Type notes
        </SuggestionChip>
      </div>
    </div>
  );
}

function SuggestionChip({
  icon,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-6 items-center gap-1 rounded-xs border border-brand/12 bg-brand/5 px-2 text-[10px] font-medium text-brand/70 transition-colors duration-150 hover:border-brand/20 hover:bg-brand/10 hover:text-brand"
    >
      {icon}
      {children}
    </button>
  );
}
