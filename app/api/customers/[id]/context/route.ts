import { NextResponse } from "next/server";
import { getCallContexts } from "@/lib/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contexts = getCallContexts(id);
  return NextResponse.json({ contexts });
}
