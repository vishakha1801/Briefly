import type { CallContext, Customer, DealBrief } from "./types";

/**
 * Builds a Deal Brief from customer context + transcripts without a model, so
 * the feature works offline. Cue-word extraction over notes + call transcripts.
 */
export function buildDealBrief(
  customer: Customer,
  callContexts: CallContext[]
): DealBrief {
  const noteText = customer.notes
    .map((n) => `${n.headline}. ${n.body}`)
    .join(" ");
  const callText = callContexts.map((c) => c.transcript).join(" ");
  const corpus = `${noteText} ${callText}`;
  const sentences = corpus
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);

  const find = (re: RegExp, n = 2) =>
    sentences.filter((s) => re.test(s)).slice(0, n);

  const pain = find(
    /(manual|slow|time-?consuming|struggl|painful|bottleneck|hard to|difficult|frustrat|wast|hours a week|behind)/i,
    3
  );

  const risk = find(
    /(price|pricing|expensive|budget|cost|not sure|concern|worried|hesit|legal|procurement|security|sso|compliance|timeline|competitor|too much)/i,
    3
  );

  const openTasks = customer.tasks.filter((t) => !t.done);
  const recommendedNextStep =
    openTasks[0]?.title || "Send a recap and confirm the next meeting.";

  const priceSensitive = /price|pricing|budget|expensive|cost|too much/i.test(corpus);

  const firstName = customer.name.split(" ")[0];
  const leadWith = priceSensitive
    ? "Lead with ROI and a fast onboarding timeline — anchor value before price comes up."
    : pain.length
      ? `Tie the demo directly to the pain they named in the last call.`
      : `Confirm their goal and decision criteria before proposing next steps.`;

  const suggestedTalkTrack = priceSensitive
    ? `"${firstName}, I want the price to reflect the value — can I walk you through the ROI and how fast you'd be live?"`
    : pain.length
      ? `"${firstName}, based on what you flagged, here's exactly how we'd remove that — want me to show you?"`
      : `"${firstName}, to make this a clear yes, what would you need to see next?"`;

  return {
    customerId: customer.id,
    customerName: customer.name,
    leadWith: clean(leadWith),
    customerConcern: pain.length ? pain.map(clean) : ["No explicit concern captured yet."],
    likelyObjection: risk.length ? risk.map(clean) : ["No blockers surfaced yet."],
    suggestedTalkTrack,
    recommendedNextStep,
  };
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
