import { NextResponse } from "next/server";
import { hasOpenAI, openai } from "@/lib/openai";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("audio") as File | null;

  if (!file) {
    return NextResponse.json({ error: "audio file required" }, { status: 400 });
  }

  if (!hasOpenAI()) {
    return NextResponse.json(
      { error: "Transcription unavailable — OPENAI_API_KEY not configured." },
      { status: 503 }
    );
  }

  try {
    const transcription = await openai().audio.transcriptions.create({
      model: "whisper-1",
      file,
    });
    return NextResponse.json({ transcript: transcription.text });
  } catch {
    return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
  }
}
