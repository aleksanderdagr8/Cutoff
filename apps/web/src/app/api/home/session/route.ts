import { NextResponse } from "next/server";
import { homeDevBypassEnabled, supabaseConfigured } from "@/lib/home/config";
import {
  clearHomeSession,
  readHomeSession,
  writeHomeSession,
} from "@/lib/home/session";
import { demoSession } from "@/lib/home/store";

export async function GET() {
  const session = await readHomeSession();
  return NextResponse.json({
    session,
    auth: {
      mode: homeDevBypassEnabled()
        ? "dev_bypass"
        : supabaseConfigured()
          ? "supabase_pending"
          : "dev_bypass",
      supabase_configured: supabaseConfigured(),
      dev_bypass: homeDevBypassEnabled(),
    },
  });
}

/**
 * Sign in.
 * - Dev bypass: provisions demo household cookie (no agent secret stored).
 * - Live Supabase: not wired; returns 503 with clear message.
 */
export async function POST(request: Request) {
  if (!homeDevBypassEnabled()) {
    return NextResponse.json(
      {
        error: "auth_not_configured",
        message:
          "Supabase Auth is not wired yet. Set CUTOFF_HOME_DEV_BYPASS=1 for local, or add NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY and complete live Auth (see docs/user-tasks).",
      },
      { status: 503 },
    );
  }

  let email = "member@cutoff.local";
  try {
    const body = (await request.json()) as { email?: string };
    if (body.email && typeof body.email === "string") {
      email = body.email.trim().toLowerCase();
    }
  } catch {
    // empty body ok
  }

  const demo = await demoSession();
  const session = {
    ...demo,
    email: email || demo.email,
  };
  await writeHomeSession(session);
  return NextResponse.json({ session, auth: { mode: "dev_bypass" } });
}

export async function DELETE() {
  await clearHomeSession();
  return NextResponse.json({ ok: true });
}
