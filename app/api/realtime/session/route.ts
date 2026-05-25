import { NextResponse } from "next/server";
import { hasOpenAI, MODELS } from "@/lib/openai";

/**
 * Mints a short-lived ephemeral token for a browser WebRTC peer to connect
 * directly to the OpenAI Realtime API. The standard OPENAI_API_KEY never leaves
 * the server — the browser only ever sees the ephemeral client_secret.
 *
 * If no key is configured we return 503 so the client transparently falls back
 * to simulation mode (see lib/realtime-client.ts).
 */
export async function GET() {
  return mint();
}

export async function POST() {
  return mint();
}

async function mint() {
  if (!hasOpenAI()) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured", simulate: true },
      { status: 503 }
    );
  }

  try {
    const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: { type: "realtime", model: MODELS.realtime },
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("realtime session mint failed:", res.status, detail);
      return NextResponse.json(
        { error: "failed to mint realtime token", detail, simulate: true },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json({
      client_secret: { value: data.value },
      model: MODELS.realtime,
    });
  } catch (err) {
    console.error("realtime session error:", err);
    return NextResponse.json(
      { error: "realtime session error", simulate: true },
      { status: 500 }
    );
  }
}
