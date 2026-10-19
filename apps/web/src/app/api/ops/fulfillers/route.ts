import { NextResponse } from "next/server";
import { requireOpsSession } from "@/lib/ops/session";
import { listFulfillersView } from "@/lib/ops/store";

export async function GET() {
  const session = await requireOpsSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const fulfillers = await listFulfillersView();
  return NextResponse.json({ fulfillers });
}
