import { NextResponse } from "next/server";
import { searchCustomers, searchCustomersFuzzy } from "@/lib/store";

export async function POST(request: Request) {
  const { query, fuzzy } = (await request.json()) as {
    query?: string;
    fuzzy?: boolean;
  };

  // Default: plain substring list (used by the picker UI).
  if (fuzzy === false) {
    return NextResponse.json({ matches: searchCustomers(query ?? "") });
  }

  // Fuzzy (used by the agent's search_customer tool): top 3 with confidence.
  const ranked = searchCustomersFuzzy(query ?? "");
  return NextResponse.json({
    matches: ranked.map((r) => r.customer),
    ranked: ranked.map((r) => ({
      id: r.customer.id,
      name: r.customer.name,
      company: r.customer.company,
      confidence: Number(r.confidence.toFixed(2)),
    })),
  });
}
