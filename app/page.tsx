"use client";

import { useEffect, useState } from "react";
import { ListIcon } from "lucide-react";
import { OrbStage } from "@/components/voice/orb-stage";
import { CallRecap } from "@/components/voice/call-recap";
import { PostCallNotes } from "@/components/voice/post-call-notes";
import { CommandBar } from "@/components/voice/command-bar";
import { ContextChip } from "@/components/voice/context-chip";
import { ContextPrompts } from "@/components/voice/context-prompts";
import { LiveTranscript } from "@/components/voice/live-transcript";
import { RightSidebar } from "@/components/voice/right-sidebar";
import { ImportCallModal } from "@/components/voice/import-call-modal";
import { Button } from "@/components/ui/button";
import {
  segmentedControlButtonClass,
  segmentedControlListClass,
} from "@/components/ui/segmented-control";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAgent } from "@/lib/use-agent";
import { useAgentStore } from "@/lib/agent-store";
import { useCustomer, useIsDesktop } from "@/lib/hooks";
import { newSessionId } from "@/lib/session";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function VoiceHome() {
  const existing = useAgentStore.getState().sessionId;
  const [sessionId] = useState(() => existing ?? newSessionId());
  const agent = useAgent(sessionId);
  const { pttStart, pttStop } = agent;
  const isDesktop = useIsDesktop();
  const [importOpen, setImportOpen] = useState(false);

  const status = useAgentStore((s) => s.status);
  const voiceMode = useAgentStore((s) => s.voiceMode);
  const centerView = useAgentStore((s) => s.centerView);
  const selectedCustomerId = useAgentStore((s) => s.selectedCustomerId);
  const actionCount = useAgentStore((s) => s.actions.length);
  const { data: customer } = useCustomer(selectedCustomerId ?? "");

  const live = status === "live";
  // Spacebar PTT: hold to record, release to send — desktop only.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space" || e.repeat) return;
      const el = document.activeElement as HTMLElement | null;
      const isTyping =
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);
      if (isTyping) return;

      const store = useAgentStore.getState();
      if (
        store.voiceMode !== "ptt" ||
        store.status !== "live" ||
        store.activeCaptureMode === "recap" ||
        store.activeCaptureMode === "note"
      )
        return;

      e.preventDefault();
      pttStart();
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      const el = document.activeElement as HTMLElement | null;
      const isTyping =
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);
      if (isTyping) return;

      const store = useAgentStore.getState();
      if (
        store.voiceMode !== "ptt" ||
        store.status !== "live" ||
        store.activeCaptureMode === "recap" ||
        store.activeCaptureMode === "note"
      )
        return;

      e.preventDefault();
      pttStop();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [pttStart, pttStop]);

  function onMainButton() {
    const store = useAgentStore.getState();
    if (!live || store.mode === "simulation") {
      agent.startRealtime(customer ?? null);
      return;
    }
    if (voiceMode === "continuous") agent.toggleMic();
  }

  return (
    <>
      <ImportCallModal open={importOpen} onOpenChange={setImportOpen} />

      <main className="relative flex h-dvh w-full flex-col overflow-hidden">
        {/* ── Ambient bloom — atmospheric glow behind the orb ────── */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-[45%] top-0 -translate-x-1/2"
          style={{
            width: "700px",
            height: "520px",
            borderRadius: "50%",
            background:
              "radial-gradient(ellipse at 50% 22%, rgba(59,73,234,0.11) 0%, rgba(174,183,255,0.06) 40%, transparent 66%)",
            filter: "blur(64px)",
          }}
        />

        {/* ── Top bar ─────────────────────────────────────────────── */}
        <header className="glass-navbar flex shrink-0 items-center justify-between gap-3 px-4 py-2.5 sm:px-6 z-10">
          <div className="logo-group flex items-center gap-2.5">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 32 32"
              fill="none"
              className="logo-mark size-7 shrink-0"
              aria-hidden="true"
            >
              <defs>
                <radialGradient id="lm-base" cx="11" cy="8" r="24" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#5D6AF2" />
                  <stop offset="42%" stopColor="#3B49EA" />
                  <stop offset="100%" stopColor="#090E2E" />
                </radialGradient>
                <radialGradient id="lm-spec" cx="9" cy="7" r="11" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="white" stopOpacity="0.52" />
                  <stop offset="100%" stopColor="white" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="lm-amb" cx="22" cy="24" r="10" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#AEB7FF" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#AEB7FF" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="lm-rim" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#5ED7FF" stopOpacity="0.65" />
                  <stop offset="48%" stopColor="#AEB7FF" stopOpacity="0.42" />
                  <stop offset="100%" stopColor="#3B49EA" stopOpacity="0.08" />
                </linearGradient>
              </defs>
              <circle cx="16" cy="16" r="14.5" fill="url(#lm-base)" />
              <circle cx="16" cy="16" r="14.5" fill="url(#lm-spec)" />
              <circle cx="16" cy="16" r="14.5" fill="url(#lm-amb)" />
              <circle cx="16" cy="16" r="13.8" stroke="url(#lm-rim)" strokeWidth="1.2" fill="none" />
            </svg>
            <span className="font-heading text-[17px] font-semibold tracking-[0.041em] text-foreground">
              Briefly
            </span>
          </div>

          <div className="flex items-center gap-2">
            <ContextChip />
            {!isDesktop && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative rounded-full"
                    aria-label="Customer and actions"
                  >
                    <ListIcon className="size-4" />
                    {actionCount > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
                        {actionCount}
                      </span>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="glass-strong w-[330px] p-0">
                  <SheetHeader className="px-4 pb-0 pt-4">
                    <SheetTitle className="text-sm">
                      Customer &amp; Actions
                    </SheetTitle>
                  </SheetHeader>
                  <div className="flex h-full flex-col px-3 pb-4 pt-3">
                    <RightSidebar />
                  </div>
                </SheetContent>
              </Sheet>
            )}
          </div>
        </header>

        {/* ── Body ────────────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1">
          {/* ── Center workspace — one cohesive voice session ──── */}
          <section className="flex min-w-0 flex-1 flex-col gap-4 px-3 pb-3 pt-3 sm:px-5 sm:pt-3">
            {/* Orb */}
            <OrbStage size={isDesktop ? 147 : 113} />

            {/* Quick actions */}
            <ContextPrompts
              onDealBrief={agent.dealBrief}
              onImportTranscript={() => setImportOpen(true)}
            />

            <div className="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg">
              {/* Workspace Navigation Bar */}
              <div className="flex shrink-0 flex-col gap-1.5 border-b border-brand/8 bg-white/25 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                <span className="min-h-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {customer?.name ?? ""}
                </span>
                <div className={cn(segmentedControlListClass, "grid-cols-3 sm:ml-auto sm:w-auto")}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => useAgentStore.getState().setCenterView("transcript")}
                        className={segmentedControlButtonClass(centerView === "transcript", "sm:px-3")}
                      >
                        Conversation
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Chat with the copilot about the customer, call, or follow-ups.
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => useAgentStore.getState().setCenterView("recap")}
                        className={segmentedControlButtonClass(centerView === "recap", "sm:px-3")}
                      >
                        Call recap
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Import or add a recap of the last call.
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => useAgentStore.getState().setCenterView("notes")}
                        className={segmentedControlButtonClass(centerView === "notes", "sm:px-3")}
                      >
                        Post-call notes
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Review and save structured notes generated from the call.
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Main content view */}
              <div className="min-h-0 flex-1 overflow-hidden">
                {centerView === "recap" ? (
                  <CallRecap
                    onImportTranscript={() => setImportOpen(true)}
                    onGeneratePostCallNotes={agent.captureNote}
                    onCreateFollowUp={agent.createFollowUp}
                  />
                ) : centerView === "notes" ? (
                  <PostCallNotes
                    onSaveNote={agent.savePostCallNote}
                    onUpdateDraft={agent.updatePostCallDraft}
                    onCreateFollowUp={agent.createFollowUp}
                  />
                ) : (
                  <LiveTranscript
                    live={live}
                    onEditTurn={agent.editTurn}
                  />
                )}
              </div>

              {/* Command Bar */}
              <CommandBar
                live={live}
                onMic={onMainButton}
                onHoldStart={agent.pttStart}
                onHoldEnd={agent.pttStop}
                onSend={agent.sendRep}
                onEnd={agent.end}
                onInterrupt={agent.interrupt}
                onSetVoiceMode={agent.setVoiceMode}
              />
            </div>
          </section>

          {/* ── Right sidebar (desktop only) ───────────────────── */}
          {isDesktop && (
            <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-brand/8 bg-white/20 px-4 py-4 backdrop-blur-xl xl:w-[400px]">
              <div className="mb-3 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Context &amp; Actions
              </div>
              <div className="min-h-0 flex-1">
                <RightSidebar />
              </div>
            </aside>
          )}
        </div>
      </main>

      {/* Hidden sink for the agent's voice in realtime mode. */}
      {/* autoPlay is required — the track arrives outside a user-gesture context. */}
      <audio
        id="briefly-agent-audio"
        autoPlay
        playsInline
        className="pointer-events-none fixed bottom-0 left-0 h-px w-px opacity-0"
      />
    </>
  );
}
