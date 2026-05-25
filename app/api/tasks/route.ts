import { NextResponse } from "next/server";
import * as chrono from "chrono-node";
import { addTask, updateTask } from "@/lib/store";
import type { Priority } from "@/lib/types";

type Body = {
  customerId?: string;
  title?: string;
  dueDate?: string;
  priority?: Priority;
  source?: "manual" | "call";
};

/**
 * Parses a natural-language or ISO date into yyyy-mm-dd. Handles the brief's
 * "remind me Thursday" / "next Tuesday" / "in two weeks" cases via chrono-node.
 */
function parseDueDate(input?: string): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  // Already an ISO date.
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const parsed = chrono.parseDate(trimmed, new Date(), { forwardDate: true });
  if (!parsed) return undefined;
  // Format using local date parts so the stored day matches what chrono meant.
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function POST(request: Request) {
  const b = (await request.json()) as Body;
  if (!b.customerId || !b.title) {
    return NextResponse.json(
      { error: "customerId and title required" },
      { status: 400 }
    );
  }
  const task = addTask({
    customerId: b.customerId,
    title: b.title,
    dueDate: parseDueDate(b.dueDate),
    priority: b.priority,
    source: b.source ?? "call",
  });
  if (!task) {
    return NextResponse.json({ error: "customer not found" }, { status: 404 });
  }
  return NextResponse.json({ task }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    taskId?: string;
    done?: boolean;
    title?: string;
    dueDate?: string;
    priority?: Priority;
  };
  const { taskId, done, title, dueDate, priority } = body;
  if (!taskId) {
    return NextResponse.json({ error: "taskId required" }, { status: 400 });
  }
  const task = updateTask({
    taskId,
    done,
    title: title?.trim(),
    dueDate: "dueDate" in body ? parseDueDate(dueDate) ?? "" : undefined,
    priority,
  });
  if (!task) {
    return NextResponse.json({ error: "task not found" }, { status: 404 });
  }
  return NextResponse.json({ task });
}
