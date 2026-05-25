import { NextResponse } from "next/server";
import { getCustomer, searchCustomersFuzzy } from "@/lib/store";

// Backs the get_customer_history tool.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let customer = getCustomer(id);

  // Fallback: model passed a name instead of an id — resolve via fuzzy search.
  if (!customer) {
    const results = searchCustomersFuzzy(id);
    customer = results[0]?.customer;
  }

  if (!customer) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ customer });
}
