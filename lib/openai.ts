import "server-only";
import OpenAI from "openai";

export const MODELS = {
  realtime: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2",
  text: process.env.OPENAI_TEXT_MODEL || "gpt-4o",
  fast: process.env.OPENAI_FAST_MODEL || "gpt-4o-mini",
};

export function hasOpenAI(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

let client: OpenAI | null = null;
export function openai(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}
