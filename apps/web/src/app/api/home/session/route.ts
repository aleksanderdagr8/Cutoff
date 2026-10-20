import { NextResponse } from "next/server";
import { endHouseholdAuth, startPasswordSignIn, startSignUp } from "@/lib/home/auth-flow";
import type { AuthFlowResult } from "@/lib/home/auth-flow";
import { householdAuthClient } from "@/lib/home/auth-client";
import { requestOrigin } from "@/lib/home/email-otp";
import { homeDevBypassEnabled, supabaseConfigured } from "@/lib/home/config";
import { readHomeAuthGate, clearHomeSession, writeHomeSession } from "@/lib/home/session";
import { demoSession } from "@/lib/home/store";
import { createHomeServerClient } from "@/lib/home/supabase/server";

function authMeta() {
  return {
    mode: homeDevBypassEnabled()
      ? ("dev_bypass" as const)
      : ("supabase" as const),
    supabase_configured: supabaseConfigured(),
    dev_bypass: homeDevBypassEnabled(),
  };
}

function jsonResult(result: AuthFlowResult) {
  if (result.ok) return NextResponse.json({ ...result.body, auth: authMeta() });
  return NextResponse.json(
    { ...result.body, auth: authMeta() },
    { status: result.status },
  );
}

export async function GET() {
  const gate = await readHomeAuthGate();
  const email2fa =
    homeDevBypassEnabled()
      ? "skipped"
      : gate.state === "member"
        ? "granted"
        : gate.state === "needs_email_code"
          ? "pending"
          : "none";
  return NextResponse.json({
    session: gate.state === "member" ? gate.session : null,
    auth: { ...authMeta(), email_2fa: email2fa },
  });
}

type AuthBody = {
  email?: string;
  password?: string;
  intent?: "sign_in" | "sign_up";
};

/**
 * Sign in.
 * - Dev bypass: provisions demo household cookie (no agent secret stored).
 * - Live Auth: password, then an emailed 6-digit code before the household opens.
 */
export async function POST(request: Request) {
  if (homeDevBypassEnabled()) {
    let email = "member@cutoff.local";
    try {
      const body = (await request.json()) as AuthBody;
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
    return NextResponse.json({ session, auth: authMeta() });
  }

  if (!supabaseConfigured()) {
    return NextResponse.json(
      {
        error: "auth_not_configured",
        message:
          "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, or set CUTOFF_HOME_DEV_BYPASS=1 for local demo.",
      },
      { status: 503 },
    );
  }

  let body: AuthBody;
  try {
    body = (await request.json()) as AuthBody;
  } catch {
    return NextResponse.json(
      { error: "invalid_body", message: "Expected JSON body." },
      { status: 400 },
    );
  }

  const email = body.email ?? "";
  const password = body.password ?? "";
  const supabase = await createHomeServerClient();
  const client = householdAuthClient(supabase);

  if (body.intent === "sign_up") {
    const origin = requestOrigin(request);
    return jsonResult(
      await startSignUp(client, {
        email,
        password,
        emailRedirectTo: `${origin}/home/auth/callback?next=/home/sign-in`,
      }),
    );
  }

  return jsonResult(await startPasswordSignIn(client, { email, password }));
}

export async function DELETE() {
  if (!homeDevBypassEnabled() && supabaseConfigured()) {
    try {
      const supabase = await createHomeServerClient();
      await endHouseholdAuth(householdAuthClient(supabase));
    } catch {
      // still clear the demo cookie below
    }
  }
  await clearHomeSession();
  return NextResponse.json({ ok: true });
}
