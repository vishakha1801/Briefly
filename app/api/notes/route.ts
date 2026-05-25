import { NextResponse } from "next/server";
import { addNote, updateNote } from "@/lib/store";
import type { StructuredNote } from "@/lib/types";

type Body = {
  customerId?: string;
  headline?: string;
  body?: string;
  structuredNote?: StructuredNote;
  rawText?: string;
  source?: "manual" | "call";
};

function composeBody(n: StructuredNote): string {
  const bullet = (items?: string[]) =>
    (items ?? []).map((i) => `• ${i}`).join("\n");

  return [
    n.mood ? `Mood: ${n.mood}` : "",
    n.summary ? `Summary:\n${n.summary}` : "",
    n.keyPoints?.length ? `Key points:\n${bullet(n.keyPoints)}` : "",
    n.suggestedFollowUps?.length
      ? `Suggested follow-ups:\n${bullet(n.suggestedFollowUps)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function POST(request: Request) {
  const b = (await request.json()) as Body;
  if (!b.customerId) {
    return NextResponse.json({ error: "customerId required" }, { status: 400 });
  }

  let headline = b.headline ?? "Call note";
  let body = b.body ?? "";

  if (b.structuredNote) {
    headline =
      b.structuredNote.title ??
      b.structuredNote.summary?.slice(0, 60) ??
      b.structuredNote.keyPoints?.[0] ??
      headline;
    body = composeBody(b.structuredNote) || body;
  } else if (b.rawText) {
    headline = b.headline ?? truncate(b.rawText);
    body = b.rawText;
  }

  const note = addNote({
    customerId: b.customerId,
    headline,
    body,
    source: b.source ?? "call",
  });
  if (!note) {
    return NextResponse.json({ error: "customer not found" }, { status: 404 });
  }
  return NextResponse.json({ note }, { status: 201 });
}

export async function PATCH(request: Request) {
  const b = (await request.json()) as {
    noteId?: string;
    headline?: string;
    body?: string;
  };
  if (!b.noteId || !b.headline?.trim()) {
    return NextResponse.json(
      { error: "noteId and headline required" },
      { status: 400 }
    );
  }

  const note = updateNote({
    noteId: b.noteId,
    headline: b.headline.trim(),
    body: b.body?.trim() ?? "",
  });
  if (!note) {
    return NextResponse.json({ error: "note not found" }, { status: 404 });
  }
  return NextResponse.json({ note });
}

function truncate(s: string, n = 60) {
  const t = s.trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}
