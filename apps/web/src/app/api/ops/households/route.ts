import { NextResponse } from "next/server";
import { requireOpsSession } from "@/lib/ops/session";
import { listHouseholdsView } from "@/lib/ops/store";

export async function GET() {
  const session = await requireOpsSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const households = await listHouseholdsView();
  return NextResponse.json({ households });
}
