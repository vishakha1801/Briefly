"use client";

import { Orb as ElevenLabsOrb, type AgentState } from "@/components/ui/orb";

/** The orb's visual state — reflects exactly what the agent is doing. */
export type OrbState =
  | "idle"
  | "connecting"
  | "listening"
  | "transcribing"
  | "thinking"
  | "responding"
  | "speaking"
  | "tool"
  | "error";

const ACTIVE_STATES = new Set<OrbState>([
  "listening",
  "transcribing",
  "thinking",
  "responding",
  "speaking",
  "tool",
]);

const ACTIVE_COLORS: [string, string] = ["#3B49EA", "#AEB7FF"];
const IDLE_COLORS: [string, string] = ["#D7DAE8", "#8E94AA"];

const AGENT_STATE_MAP: Record<OrbState, AgentState> = {
  idle: null,
  connecting: null,
  listening: "listening",
  transcribing: "listening",
  thinking: "thinking",
  responding: "thinking",
  speaking: "talking",
  tool: "thinking",
  error: null,
};

export function Orb({
  state,
  level = 0,
  size = 160,
  className,
}: {
  state: OrbState;
  level?: number;
  size?: number;
  className?: string;
}) {
  const agentState = AGENT_STATE_MAP[state];
  const colors = ACTIVE_STATES.has(state) ? ACTIVE_COLORS : IDLE_COLORS;

  // We map real-time microphone levels when the user is speaking/listening.
  // When the agent is speaking or thinking, we use ElevenLabs' built-in "auto" mode,
  // which simulates organic fluid sound waves using the shader.
  const volumeMode = state === "listening" ? "manual" : "auto";

  return (
    <div 
      className={className} 
      style={{ width: size, height: size }}
    >
      <ElevenLabsOrb
        agentState={agentState}
        colors={colors}
        volumeMode={volumeMode}
        manualInput={level}
        manualOutput={state === "speaking" ? level || 0.6 : 0}
        seed={42} // Fixed seed for consistent organic visuals
        className="h-full w-full"
      />
    </div>
  );
}
