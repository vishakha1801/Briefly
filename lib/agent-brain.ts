/**
 * Offline "brain" for the rep<>agent conversation. When the Realtime API isn't
 * available, this interprets what the rep said into an intent the orchestration
 * hook turns into tool calls + spoken confirmations. Deterministic and grounded
 * — it never invents customer data.
 */

export type AgentIntent =
  | { kind: "end" }
  | { kind: "task"; title: string; dateText?: string; name?: string }
  | { kind: "note"; raw: boolean; text: string; name?: string }
  | { kind: "lookup"; name?: string }
  | { kind: "deal_brief"; name?: string }
  | { kind: "summarize_call"; name?: string }
  | { kind: "create_customer"; name: string; company: string; notes?: string }
  | { kind: "chat"; reply: string };

const DATE_RE =
  /\b(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|this week|next month|in \d+ (?:day|days|week|weeks|month|months)|on the \d+(?:st|nd|rd|th)?)\b/i;

const STOP = new Set([
  "Look", "Pull", "Find", "Search", "Remind", "Save", "Note", "Add", "Create",
  "Set", "Tell", "Catch", "What", "Where", "Show", "Give", "Get", "Hey", "Okay",
  "Can", "Could", "Please", "Just", "Summarize", "Recap", "Wrap", "Follow",
  "Update", "Make", "Let", "Loop", "Send", "Schedule", "Draft", "Status",
]);

function extractName(u: string): string | undefined {
  // Match prepositions followed by a capitalized name (one or two words).
  const m = u.match(/\b(?:with|for|about|on|regarding)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
  if (m) return m[1];
  // Match "tell me [something] about X", "know about X", "something about X".
  const m2 = u.match(/\b(?:tell me(?: \w+)?|know|something)\s+about\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
  if (m2) return m2[1];
  // Possessive: "Maya's tasks" → "Maya"
  const m3 = u.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)'s\b/);
  if (m3) return m3[1];
  // Fall back to any capitalized words not in the stop list.
  const caps = [...u.matchAll(/\b([A-Z][a-z]{2,})\b/g)]
    .map((x) => x[1])
    .filter((w) => !STOP.has(w));
  return caps.length ? caps.slice(0, 2).join(" ") : undefined;
}

/** Strip command/filler words so the remainder is a good customer search query. */
export function cleanQuery(u: string): string {
  return u
    .replace(
      /\b(look ?up|pull up|find|search for|search|remind me( to)?|create a task( to)?|add a task( to)?|set a reminder( to)?|save (a )?note( that)?|note that|take a note|tell me about|catch me up( on)?|what(?:'s| is| did)?|status of|history of|where are we|on|about|for|with|the|a|please|can you|could you|just|me|to)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function extractCompany(u: string): string {
  const m = u.match(/\bat\s+([A-Z][A-Za-z\s&]+?)(?:\.|,|$)/);
  if (m) return m[1].trim();
  return "Unknown Company";
}

export function interpret(u: string): AgentIntent {
  const t = u.trim();
  const lower = t.toLowerCase();

  // Greetings / small talk — respond naturally, no tool calls needed
  if (/^(hey|hi|hello|howdy|yo|what'?s up|sup|can you hear me|testing|thanks|thank you|cheers|sounds good|got it|ok|okay|cool|perfect|great|awesome|nice)[\s!?.,]*$/i.test(lower)) {
    const greetings: Record<string, string> = {
      hey: "Hey! Ready to help. Ask me to look up a customer, save a note, or create a follow-up.",
      hi: "Hi! What can I do for you?",
      hello: "Hello! I'm here. What do you need?",
      "what's up": "All good! Ask me anything about your customers or to capture something from this call.",
      "can you hear me": "Yep, loud and clear! What would you like to do?",
      testing: "Working perfectly. Try asking me about a customer or creating a task.",
      thanks: "Of course! Anything else?",
      "thank you": "Happy to help. Anything else?",
    };
    const key = Object.keys(greetings).find((k) => lower.startsWith(k));
    return {
      kind: "chat",
      reply: greetings[key ?? "hey"] ?? "Hey! What can I help you with?",
    };
  }

  if (/\b(i'?m done|that'?s all|end session|stop session|we'?re done|goodbye|that is all)\b/.test(lower)) {
    return { kind: "end" };
  }

  // Create customer: "create a new customer named X at Y" / "add a contact X at Y"
  if (/\b(create (a )?(new )?(customer|contact|lead)|add (a )?(new )?(customer|contact|lead))\b/.test(lower)) {
    const nameMatch = u.match(/\bnamed?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i)
      ?? u.match(/\b(customer|contact|lead)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i);
    const name = nameMatch ? (nameMatch[1] || nameMatch[2]) : extractName(t) ?? "New Customer";
    const company = extractCompany(t);
    return { kind: "create_customer", name, company };
  }

  // Talking points: "brief me", "get talking points", "what should I know before the call", "prep me"
  if (
    /\b(brief me|prep me|prep for|get me up to speed|what should i know|before (i|the|this|our) (call|talk|meeting)|prepare me|brief on|talking points?|get (me )?(the )?talking points?)\b/.test(
      lower
    )
  ) {
    return { kind: "deal_brief", name: extractName(t) };
  }

  // Summarize call: "summarize our last call" / "what happened on the call with X"
  if (/\b(summarize|summary|recap|what (did|happened|came up)|key points|last call|previous call|our call|what objections?|what (were|was) (the|their))\b/.test(lower)) {
    return { kind: "summarize_call", name: extractName(t) };
  }

  if (/\b(remind|follow ?up|create a task|add a task|set a reminder|to-?do|task to)\b/.test(lower)) {
    const dateText = t.match(DATE_RE)?.[0];
    const title = t
      .replace(/^(hey |ok |okay |so |can you |could you |please )/i, "")
      .replace(/\bremind me to\b/i, "")
      .replace(/\bremind me\b/i, "")
      .replace(/\bcreate a task to\b/i, "")
      .replace(/\badd a task to\b/i, "")
      .replace(/\bset a reminder to\b/i, "")
      .replace(DATE_RE, "")
      .replace(/[.,!?\s]+$/, "")
      .replace(/\b(on|by|to|with|for|at)\s*$/i, "")
      .replace(/[.,!?\s]+$/, "")
      .replace(/\s+/g, " ")
      .trim();
    return {
      kind: "task",
      title:
        (title.charAt(0).toUpperCase() + title.slice(1)).trim() ||
        "Follow up",
      dateText,
      name: extractName(t),
    };
  }

  if (/\b(save this|save the note|save post-call notes?|add (it|this) to notes)\b/.test(lower)) {
    return {
      kind: "chat",
      reply: "I can save the reviewed post-call note when a draft is ready.",
    };
  }

  if (/\b(save (a )?note|note that|log that|capture|take a note|jot)\b/.test(lower) ||
      /\bjust save (what i said|that)\b/.test(lower)) {
    const raw = /\bjust save (what i said|that)\b|\bsave what i said\b/.test(lower);
    const text = t
      .replace(/^(hey |ok |okay |so |can you |could you |please )/i, "")
      .replace(/\b(save (a )?note( that)?|note that|log that|take a note|capture)\b/i, "")
      .replace(/^[:,\s-]+/, "")
      .trim();
    return { kind: "note", raw, text, name: extractName(t) };
  }

  // Open tasks: "What are Maya's open tasks?" / "show follow-up tasks"
  if (/\b(open tasks?|follow.?up tasks?|show tasks?|list tasks?|tasks? for|what are .+ tasks?|pending tasks?)\b/.test(lower)) {
    return { kind: "lookup", name: extractName(t) };
  }

  // Background / profile lookup: "about Maya", "background on Diego", "tell me about Hana"
  if (/\b(about|background|context|profile|who is|who'?s|describe|give me|deal status|current stage|stage for|where are we with|catch me up|what do we know|history|status|pull up|look ?up|tell me about|something about|know about|tell me something|what'?s the status|what did|any (info|notes|tasks|follow.?ups?))\b/.test(lower)) {
    return { kind: "lookup", name: extractName(t) };
  }

  return {
    kind: "chat",
    reply:
      "I'm here. You can ask me to look up a customer, summarize a call, save a note, or create a follow-up task.",
  };
}
