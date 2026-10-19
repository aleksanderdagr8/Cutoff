import { NextResponse } from "next/server";
import { readHomeSession } from "@/lib/home/session";
import { listLinesForSession } from "@/lib/home/store";

export async function GET() {
  const session = await readHomeSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const lines = await listLinesForSession(session);
  return NextResponse.json({
    household_id: session.householdId,
    lines,
  });
}
