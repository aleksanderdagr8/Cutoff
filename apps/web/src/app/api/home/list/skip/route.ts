import { NextResponse } from "next/server";
import { readHomeSession } from "@/lib/home/session";
import { skipListLineForSession } from "@/lib/home/store";

export async function POST(request: Request) {
  const session = await readHomeSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    list_line_id?: string;
  } | null;
  if (!body?.list_line_id) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const result = await skipListLineForSession(session, body.list_line_id);
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status as 401 },
    );
  }
  return NextResponse.json({ line_id: result.line_id, paused: true as const });
}
