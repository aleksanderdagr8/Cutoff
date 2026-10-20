import { NextResponse } from "next/server";
import { opsDevBypassEnabled, supabaseConfigured } from "@/lib/ops/config";
import {
  clearOpsSession,
  readOpsSession,
  writeOpsSession,
} from "@/lib/ops/session";
import { demoOpsSession } from "@/lib/ops/store";

export async function GET() {
  const session = await readOpsSession();
  return NextResponse.json({
    session,
    auth: {
      mode: opsDevBypassEnabled() ? "dev_bypass" : "closed",
      supabase_configured: supabaseConfigured(),
      dev_bypass: opsDevBypassEnabled(),
      totp: "parked",
    },
  });
}

/**
 * Operator sign-in.
 * - Dev bypass: provisions demo operator cookie (no TOTP).
 * - Live Auth + TOTP: not wired; returns 503.
 */
export async function POST(request: Request) {
  if (!opsDevBypassEnabled()) {
    return NextResponse.json(
      {
        error: "auth_not_configured",
        message:
          "Operator sign-in is closed. Production /ops requires Cloudflare Access. The dev bypass is only available in local next dev.",
      },
      { status: 503 },
    );
  }

  let email = "ops@cutoff.local";
  try {
    const body = (await request.json()) as { email?: string };
    if (body.email && typeof body.email === "string") {
      email = body.email.trim().toLowerCase();
    }
  } catch {
    // empty body ok
  }

  const demo = await demoOpsSession();
  const session = {
    ...demo,
    email: email || demo.email,
  };
  await writeOpsSession(session);
  return NextResponse.json({
    session,
    auth: { mode: "dev_bypass", totp: "parked" },
  });
}

export async function DELETE() {
  await clearOpsSession();
  return NextResponse.json({ ok: true });
}
