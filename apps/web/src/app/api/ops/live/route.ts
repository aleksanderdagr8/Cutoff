import { NextResponse } from "next/server";
import { requireOpsSession } from "@/lib/ops/session";
import { getLiveView } from "@/lib/ops/store";

export async function GET() {
  const session = await requireOpsSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const live = await getLiveView("2026-10-19T12:10:00.000Z");
  return NextResponse.json(live);
}
