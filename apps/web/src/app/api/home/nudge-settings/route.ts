import { NextResponse } from "next/server";
import { readHomeSession } from "@/lib/home/session";
import {
  getNudgeSettingsForSession,
  upsertNudgeSettingsForSession,
} from "@/lib/home/store";

export async function GET() {
  const session = await readHomeSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const settings = await getNudgeSettingsForSession(session);
  return NextResponse.json(settings);
}

export async function PUT(request: Request) {
  const session = await readHomeSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    agent_webhook_url?: string | null;
    email_enabled?: boolean;
  } | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const result = await upsertNudgeSettingsForSession(session, {
    agent_webhook_url: body.agent_webhook_url,
    email_enabled: body.email_enabled,
  });
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status as 401 },
    );
  }
  return NextResponse.json(result);
}
