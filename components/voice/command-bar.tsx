"use client";

import { ArrowUpIcon, MicIcon, MicOffIcon, PowerIcon } from "lucide-react";
import { VoiceButton } from "@/components/voice/voice-button";
import { Button } from "@/components/ui/button";
import {
  segmentedControlButtonClass,
  segmentedControlListClass,
} from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";
import { useAgentStore, type VoiceMode } from "@/lib/agent-store";
import { cn } from "@/lib/utils";

export function CommandBar({
  live,
  onMic,
  onHoldStart,
  onHoldEnd,
  onSend,
  onEnd,
  onInterrupt,
  onSetVoiceMode,
}: {
  live: boolean;
  onMic: () => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
  onSend: (text: string) => void;
  onEnd: () => void;
  onInterrupt: () => void;
  onSetVoiceMode: (m: VoiceMode) => void;
}) {
  const text = useAgentStore((s) => s.inputDraft);
  const setText = useAgentStore((s) => s.setInputDraft);
  const voiceMode = useAgentStore((s) => s.voiceMode);
  const activity = useAgentStore((s) => s.activity);

  const pttListening = live && voiceMode === "ptt" && activity === "listening";
  const agentSpeaking = live && activity === "speaking";

  function submit() {
    if (!text.trim()) return;
    onSend(text);
    setText("");
  }

  const textareaStyle = pttListening
    ? undefined
    : {
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.64) 0%, rgba(232,236,255,0.46) 100%)",
        borderColor: "rgba(59, 73, 234, 0.14)",
      };

  const textareaBaseClass = cn(
    "max-h-28 flex-1 resize-none rounded-sm border text-sm transition-[background-color,border-color,box-shadow] duration-160 ease-out-custom",
    "focus-visible:ring-0 focus-visible:outline-none",
    "shadow-[inset_0_1px_2px_rgba(59,73,234,0.04),0_1px_0_rgba(255,255,255,0.7)]",
    "focus-visible:shadow-[inset_0_1px_2px_rgba(59,73,234,0.06),0_0_0_3px_rgba(59,73,234,0.09)] focus-visible:border-brand/30",
    pttListening && "border-brand/60 bg-brand/5"
  );

  return (
    <div className="glass-command-bar shrink-0 px-2.5 py-2">
      {/* ── Mobile: 2-row layout ──────────────────────────────── */}
      <div className="flex flex-col gap-1 sm:hidden">
        {/* Row 1: mode toggle + end */}
        <div className="flex items-center gap-1">
          <div className={cn(segmentedControlListClass, "grid-cols-2")}>
            {(["ptt", "continuous"] as const).map((m) => (
              <button
                key={m}
                onClick={() => onSetVoiceMode(m)}
                className={segmentedControlButtonClass(voiceMode === m)}
              >
                {m === "ptt" ? "Push-to-talk" : "Hands-free"}
              </button>
            ))}
          </div>
          {live && (
            <Button
              size="icon"
              variant="ghost"
              onClick={onEnd}
              aria-label="End session"
              className="size-7 shrink-0 rounded-sm text-muted-foreground transition-[transform,background-color,color] duration-150 ease-out-custom hover:bg-rose-500/10 hover:text-rose-500 active:scale-[0.97]"
            >
              <PowerIcon className="size-3.5" />
            </Button>
          )}
        </div>

        {/* Row 2: mic + input + send */}
        <div className="flex items-end gap-1.5">
          {/* Compact mobile mic — 44px, soft shadow, no glow rings */}
          <button
            type="button"
            aria-label={
              agentSpeaking
                ? "Interrupt"
                : live && voiceMode === "ptt"
                ? "Hold to talk"
                : live
                ? "Mic"
                : "Start"
            }
            title={agentSpeaking ? "Interrupt" : undefined}
            className={cn(
              "relative grid shrink-0 touch-none select-none place-items-center rounded-full text-white transition-[transform,box-shadow,opacity] duration-160 ease-out-custom active:scale-[0.97] disabled:opacity-40",
              "size-11",
              live
                ? "shadow-[0_1px_6px_rgba(59,73,234,0.18),inset_0_1px_0_rgba(255,255,255,0.14)]"
                : "shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
            )}
            style={{
              background: live
                ? "#3B49EA"
                : "linear-gradient(150deg, var(--primary), oklch(0.18 0.012 250))",
            }}
            {...(live && voiceMode === "ptt" && !agentSpeaking
              ? {
                  onPointerDown: (e: React.PointerEvent) => {
                    e.preventDefault();
                    onHoldStart();
                  },
                  onPointerUp: onHoldEnd,
                  onPointerLeave: onHoldEnd,
                }
              : { onClick: agentSpeaking ? onInterrupt : onMic })}
          >
            <span className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/20" />
            {agentSpeaking ? (
              <span className="block size-[14px] rounded-[2px] bg-white" aria-hidden />
            ) : live ? (
              <MicIcon className="size-4" />
            ) : (
              <MicOffIcon className="size-4 opacity-80" />
            )}
          </button>

          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={
              pttListening
                ? "Listening… release to review, then send"
                : "Ask or speak…"
            }
            rows={1}
            className={cn(textareaBaseClass, "min-h-[36px] text-[13px] [field-sizing:normal]")}
            style={textareaStyle}
          />
          <Button
            size="icon"
            onClick={submit}
            disabled={!text.trim()}
            className="size-9 shrink-0 rounded-sm bg-brand shadow-[0_1px_5px_rgba(59,73,234,0.13)] transition-[transform,background-color,box-shadow] duration-160 ease-out-custom hover:bg-brand/90 active:scale-[0.97]"
          >
            <ArrowUpIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Desktop: single row (unchanged) ──────────────────── */}
      <div className="hidden sm:flex items-end gap-2">
        <VoiceButton
          compact
          active={live}
          speaking={agentSpeaking}
          holdToTalk={live && voiceMode === "ptt" && !agentSpeaking}
          onClick={agentSpeaking ? onInterrupt : onMic}
          onHoldStart={agentSpeaking ? undefined : onHoldStart}
          onHoldEnd={agentSpeaking ? undefined : onHoldEnd}
        />

        <div className={cn(segmentedControlListClass, "w-auto shrink-0 grid-cols-2 self-stretch")}>
          {(["ptt", "continuous"] as const).map((m) => (
            <button
              key={m}
              onClick={() => onSetVoiceMode(m)}
              className={segmentedControlButtonClass(voiceMode === m)}
            >
              {m === "ptt" ? "Push-to-talk" : "Hands-free"}
            </button>
          ))}
        </div>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={
            pttListening
              ? "Listening… release to review, then send"
              : "Speak or type a command…"
          }
          rows={1}
          className={cn(textareaBaseClass, "min-h-10 text-[13px] placeholder:text-[13px]")}
          style={textareaStyle}
        />

        <Button
          size="icon"
          onClick={submit}
          disabled={!text.trim()}
          className="size-10 shrink-0 rounded-sm bg-brand shadow-[0_2px_10px_rgba(59,73,234,0.15)] transition-[transform,background-color,box-shadow] duration-160 ease-out-custom hover:bg-brand/90 hover:shadow-[0_4px_15px_rgba(59,73,234,0.25)] active:scale-[0.97]"
        >
          <ArrowUpIcon className="size-4" />
        </Button>

        {live && (
          <Button
            size="icon"
            variant="ghost"
            onClick={onEnd}
            aria-label="End session"
            className="size-10 shrink-0 rounded-sm text-muted-foreground backdrop-blur-md transition-[transform,background-color,color] duration-150 ease-out-custom hover:bg-rose-500/10 hover:text-rose-500 active:scale-[0.97]"
          >
            <PowerIcon className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
