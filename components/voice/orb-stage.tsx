"use client";

import { Orb, type OrbState } from "@/components/voice/orb";
import { useAgentStore } from "@/lib/agent-store";

export function OrbStage({
  size = 140,
}: {
  size?: number;
}) {
  const status = useAgentStore((s) => s.status);
  const activity = useAgentStore((s) => s.activity);
  const errorMsg = useAgentStore((s) => s.errorMsg);
  const level = useAgentStore((s) => s.micLevel);
  const actions = useAgentStore((s) => s.actions);
  const pending = actions.find((a) => a.status === "pending");
  const orbSize = size * 1.1;

  const live = status === "live";
  const state: OrbState = errorMsg
    ? "error"
    : status === "connecting"
      ? "connecting"
      : !live
        ? "idle"
        : activity === "tool_running" ||
            (pending && activity !== "listening" && activity !== "speaking")
          ? "tool"
          : activity === "responding"
            ? "responding"
            : activity;

  return (
    <div className="flex w-full shrink-0 items-center justify-center" style={{ height: size }}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <Orb
          state={state}
          size={orbSize}
          level={level}
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        />
      </div>
    </div>
  );
}
