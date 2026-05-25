import { NextResponse } from "next/server";
import { getCustomer, getCallContexts } from "@/lib/store";
import { hasOpenAI, openai, MODELS } from "@/lib/openai";
import { buildStructuredNote } from "@/lib/note-fallback";
import type { StructuredNote } from "@/lib/types";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    mood: { type: "string" },
    title: { type: "string" },
    summary: { type: "string" },
    keyPoints: { type: "array", items: { type: "string" } },
    suggestedFollowUps: { type: "array", items: { type: "string" } },
  },
  required: ["mood", "title", "summary", "keyPoints", "suggestedFollowUps"],
} as const;

const SYSTEM = `You write a concise post-call note for a sales CRM. Use ONLY the provided source. Never invent facts.

Fields:
- mood: one of "Positive", "High intent", "Neutral", "Cautious", or "Mixed" — pick the one that best fits the tone of the call
- title: a short, memorable one-line title (under 80 characters)
- summary: 2–4 sentences capturing what happened, who was involved, and where things stand
- keyPoints: 3–5 bullets combining the key pain points, concerns, buying signals, and agreed next steps
- suggestedFollowUps: 1–3 specific, actionable follow-up tasks for the rep (e.g. "Send ROI one-pager to Sarah")

Be concise and direct. Sales reps read these quickly between calls.`;

export async function POST(request: Request) {
  const { customerId, conversation } = (await request.json()) as {
    customerId?: string;
    conversation?: string;
  };
  if (!customerId) {
    return NextResponse.json({ error: "customerId required" }, { status: 400 });
  }
  const customer = getCustomer(customerId);
  if (!customer) {
    return NextResponse.json({ error: "customer not found" }, { status: 404 });
  }

  const contexts = getCallContexts(customerId);
  const source =
    contexts[0]?.transcript?.trim() ||
    (conversation ?? "").trim();

  if (!source) {
    return NextResponse.json({ insufficient: true });
  }

  if (!hasOpenAI()) {
    return NextResponse.json(buildStructuredNote(source));
  }

  try {
    const completion = await openai().chat.completions.create({
      model: MODELS.text,
      temperature: 0.3,
      response_format: {
        type: "json_schema",
        json_schema: { name: "structured_note", strict: true, schema },
      },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: source.slice(0, 6000) },
      ],
    });
    const parsed = JSON.parse(
      completion.choices[0]?.message?.content ?? "{}"
    ) as StructuredNote;
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("note-draft failed, falling back:", err);
    return NextResponse.json(buildStructuredNote(source));
  }
}
