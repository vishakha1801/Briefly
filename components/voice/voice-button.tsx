"use client";

import { motion } from "motion/react";
import { MicIcon, MicOffIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The glowing primary voice control.
 * - hold-to-talk mode: press and hold to dictate (fills the command bar).
 * - continuous / start: tap to toggle listening or start a session.
 * - speaking mode: button becomes an interrupt control (stop icon).
 */
export function VoiceButton({
  active,
  disabled,
  holdToTalk = false,
  speaking = false,
  onClick,
  onHoldStart,
  onHoldEnd,
  compact = false,
}: {
  active: boolean;
  disabled?: boolean;
  holdToTalk?: boolean;
  /** Agent is currently speaking — button becomes an interrupt control. */
  speaking?: boolean;
  onClick?: () => void;
  onHoldStart?: () => void;
  onHoldEnd?: () => void;
  compact?: boolean;
}) {
  const size = compact ? 40 : 72;
  const iconSize = compact ? "size-4" : "size-7";

  // Disable hold-to-talk when the agent is mid-sentence; a tap interrupts instead.
  const holdProps = holdToTalk && !speaking
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          e.preventDefault();
          onHoldStart?.();
        },
        onPointerUp: () => onHoldEnd?.(),
        onPointerLeave: () => onHoldEnd?.(),
      }
    : { onClick };

  return (
    <div className="relative grid place-items-center">
      {/* Pulse rings — only while listening / idle-active, not while speaking */}
      {active && !compact && !speaking && (
        <>
          <motion.span
            className="absolute rounded-full"
            style={{ width: size, height: size, background: "var(--orb-2)" }}
            initial={{ opacity: 0.4, scale: 1 }}
            animate={{ opacity: 0, scale: 2.1 }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
          />
          <motion.span
            className="absolute rounded-full"
            style={{ width: size, height: size, background: "var(--orb-3)" }}
            initial={{ opacity: 0.3, scale: 1 }}
            animate={{ opacity: 0, scale: 1.7 }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", delay: 0.5 }}
          />
        </>
      )}

      <motion.button
        type="button"
        disabled={disabled && !speaking}
        whileTap={{ scale: 0.96 }}
        whileHover={{ scale: 1.025 }}
        aria-pressed={active}
        aria-label={
          speaking
            ? "Interrupt"
            : holdToTalk
            ? "Hold to talk"
            : active
            ? "Stop listening"
            : "Start"
        }
        title={speaking ? "Interrupt" : undefined}
        className={cn(
          "relative grid touch-none select-none place-items-center rounded-full text-white transition-[box-shadow,opacity] duration-160 ease-out-custom disabled:opacity-40",
          active ? "shadow-[0_0_24px_-4px_rgba(59,73,234,0.5)]" : "shadow-md",
          compact ? "size-10" : "size-[72px]"
        )}
        style={{
          background: active
            ? "#3B49EA"
            : "linear-gradient(150deg, var(--primary), oklch(0.18 0.012 250))",
        }}
        {...holdProps}
      >
        <span className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/25" />
        {speaking ? (
          /* Filled square = stop / interrupt */
          <span
            className={cn(
              "block rounded-[3px] bg-white",
              compact ? "size-3.5" : "size-6"
            )}
            aria-hidden
          />
        ) : active ? (
          <MicIcon className={iconSize} />
        ) : (
          <MicOffIcon className={cn(iconSize, "opacity-80")} />
        )}
      </motion.button>

    </div>
  );
}
