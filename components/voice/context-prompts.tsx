"use client";

import { MicIcon, PencilIcon, TargetIcon, UploadIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
      <Tooltip delayDuration={120}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleDealBrief}
            className="glass-chip flex h-7 items-center gap-1.5 rounded-sm px-3 text-xs font-medium text-muted-foreground shadow-sm transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/25"
          >
            <TargetIcon className="size-3" />
            Get talking points
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={7}
          className="rounded-md border-brand/12 bg-white/96 px-3 py-2 text-[11px] font-medium text-foreground shadow-[0_10px_28px_rgba(16,20,63,0.14)] ring-1 ring-brand/5 backdrop-blur-xl ![background:oklch(1_0_0/0.96)]"
        >
          Or say &quot;get talking points&quot;
        </TooltipContent>
      </Tooltip>

      {/* Suggestion chips — only shown when last attempt had no context */}
      <div
        className={cn(
          "flex flex-wrap items-center justify-center gap-1 transition-[max-height,opacity] duration-200 ease-out-custom",
          briefNeedsContext
            ? "max-h-24 opacity-100"
            : "pointer-events-none max-h-0 overflow-hidden opacity-0"
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
      className="flex h-6 items-center gap-1 rounded-xs border border-brand/12 bg-brand/5 px-2 text-[10px] font-medium text-brand/70 transition-[transform,background-color,border-color,color] duration-150 ease-out-custom hover:border-brand/20 hover:bg-brand/10 hover:text-brand active:scale-[0.97]"
    >
      {icon}
      {children}
    </button>
  );
}
