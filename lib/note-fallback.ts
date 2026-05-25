import type { StructuredNote } from "./types";

export function buildStructuredNote(source: string): StructuredNote {
  const sentences = source
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 12);

  const hasConcern = sentences.some((s) =>
    /(price|pricing|expensive|budget|cost|concern|worried|not sure|hesit|legal|procurement|security|timeline)/i.test(s)
  );
  const hasInterest = sentences.some((s) =>
    /(interested|excited|liked|ready|urgent|priority|pilot|trial|evaluate|move forward|decision)/i.test(s)
  );

  const mood = hasConcern && hasInterest ? "Mixed" : hasConcern ? "Cautious" : hasInterest ? "Positive" : "Neutral";

  const keyPoints = sentences.filter((s) => s.length > 24).slice(0, 5);

  const followUps = sentences
    .filter((s) =>
      /(i'?ll|we'?ll|send|share|schedule|follow up|next|set up|kick ?off|loop in|draft)/i.test(s)
    )
    .map((s) => s.replace(/^(i'?ll|we'?ll)\s+/i, "").trim())
    .slice(0, 3);

  const titleSource = keyPoints[0] ?? sentences[0] ?? "Call note";

  return {
    mood,
    title: titleSource.length > 80 ? titleSource.slice(0, 79) + "…" : titleSource,
    summary: (keyPoints.length ? keyPoints : sentences).slice(0, 3).join(" "),
    keyPoints: keyPoints.length ? keyPoints : sentences.slice(0, 3),
    suggestedFollowUps: followUps.length ? followUps : undefined,
  };
}
