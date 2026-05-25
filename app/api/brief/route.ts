import { NextResponse } from "next/server";
import { getCustomer, getCallContexts } from "@/lib/store";
import { hasOpenAI, openai, MODELS } from "@/lib/openai";
import { buildDealBrief } from "@/lib/brief-fallback";
import type { DealBrief } from "@/lib/types";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    leadWith: { type: "string" },
    customerConcern: { type: "array", items: { type: "string" } },
    likelyObjection: { type: "array", items: { type: "string" } },
    suggestedTalkTrack: { type: "string" },
    recommendedNextStep: { type: "string" },
  },
  required: ["leadWith", "customerConcern", "likelyObjection", "suggestedTalkTrack", "recommendedNextStep"],
} as const;

const SYSTEM = `You write a tight pre-call talking points card for a sales rep. Use ONLY the provided
customer notes, open tasks, and call transcripts. Never invent facts. Fields:
- leadWith: the best opening angle or hook to start the call with (one punchy line)
- customerConcern: 1-3 specific concerns or pain points the customer has expressed
- likelyObjection: 1-3 objections or blockers likely to come up
- suggestedTalkTrack: ONE sentence the rep can say verbatim on the call
- recommendedNextStep: the single best next action to propose at the end of this call (one line)
Be specific and grounded in the provided context. No generic advice.`;

export async function POST(request: Request) {
  const { customerId } = (await request.json()) as { customerId?: string };
  if (!customerId) {
    return NextResponse.json({ error: "customerId required" }, { status: 400 });
  }
  const customer = getCustomer(customerId);
  if (!customer) {
    return NextResponse.json({ error: "customer not found" }, { status: 404 });
  }
  const callContexts = getCallContexts(customerId);

  const hasContext = customer.notes.length > 0 || callContexts.length > 0;
  if (!hasContext) {
    return NextResponse.json({ insufficientContext: true });
  }

  if (!hasOpenAI()) {
    return NextResponse.json(buildDealBrief(customer, callContexts));
  }

  const context = [
    `Customer: ${customer.name} at ${customer.company} (stage: ${customer.stage}).`,
    customer.notes.length
      ? "Notes:\n" +
        customer.notes.map((n) => `- ${n.headline}: ${n.body}`).join("\n")
      : "",
    customer.tasks.filter((t) => !t.done).length
      ? "Open tasks:\n" +
        customer.tasks
          .filter((t) => !t.done)
          .map((t) => `- ${t.title}${t.dueDate ? ` (due ${t.dueDate})` : ""}`)
          .join("\n")
      : "",
    callContexts.length
      ? "Call transcripts:\n" +
        callContexts.map((c) => `[${c.title}] ${c.transcript}`).join("\n\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const completion = await openai().chat.completions.create({
      model: MODELS.text,
      temperature: 0.4,
      response_format: {
        type: "json_schema",
        json_schema: { name: "deal_brief", strict: true, schema },
      },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: context },
      ],
    });
    const parsed = JSON.parse(
      completion.choices[0]?.message?.content ?? "{}"
    ) as Omit<DealBrief, "customerId" | "customerName">;
    return NextResponse.json<DealBrief>({
      customerId,
      customerName: customer.name,
      leadWith: parsed.leadWith,
      customerConcern: parsed.customerConcern,
      likelyObjection: parsed.likelyObjection,
      suggestedTalkTrack: parsed.suggestedTalkTrack,
      recommendedNextStep: parsed.recommendedNextStep,
    });
  } catch {
    return NextResponse.json(buildDealBrief(customer, callContexts));
  }
}
