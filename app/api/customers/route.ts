import { NextResponse } from "next/server";
import { listCustomers, createCustomer } from "@/lib/store";

export async function GET() {
  return NextResponse.json({ customers: listCustomers() });
}

type CreateBody = {
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  stage?: string;
  notes?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as CreateBody;
  if (!body.name?.trim() || !body.company?.trim()) {
    return NextResponse.json(
      { error: "name and company are required" },
      { status: 400 }
    );
  }
  const customer = createCustomer({
    name: body.name.trim(),
    company: body.company.trim(),
    email: body.email,
    phone: body.phone,
    stage: body.stage,
    notes: body.notes,
  });
  return NextResponse.json({ customer }, { status: 201 });
}
