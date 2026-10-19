import { NextResponse } from "next/server";
import { requireOpsSession } from "@/lib/ops/session";
import { getOrderSheet } from "@/lib/ops/store";

type Ctx = { params: Promise<{ orderId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const session = await requireOpsSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { orderId } = await ctx.params;
  const sheet = await getOrderSheet(orderId);
  if (!sheet) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(sheet);
}
