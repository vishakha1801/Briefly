import { NextResponse } from "next/server";
import { addCallContext } from "@/lib/store";

type Body = {
  customerId?: string;
  title?: string;
  transcript?: string;
  participants?: string;
  callDate?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as Body;
  if (!body.customerId || !body.transcript?.trim()) {
    return NextResponse.json(
      { error: "customerId and transcript are required" },
      { status: 400 }
    );
  }
  const callContext = addCallContext({
    customerId: body.customerId,
    title: body.title?.trim() || "Call transcript",
    transcript: body.transcript.trim(),
    participants: body.participants,
    callDate: body.callDate,
  });
  if (!callContext) {
    return NextResponse.json({ error: "customer not found" }, { status: 404 });
  }
  return NextResponse.json({ callContext }, { status: 201 });
}
