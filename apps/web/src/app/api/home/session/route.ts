import { NextResponse } from "next/server";
import { homeDevBypassEnabled, supabaseConfigured } from "@/lib/home/config";
import { ensureHomeMember } from "@/lib/home/member";
import {
  clearHomeSession,
  readHomeSession,
  writeHomeSession,
} from "@/lib/home/session";
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

export async function GET() {
  const session = await readHomeSession();
  return NextResponse.json({
    session,
    auth: authMeta(),
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
 * - Live Auth: email + password via Supabase; links members.auth_user_id.
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

  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const intent = body.intent === "sign_up" ? "sign_up" : "sign_in";

  if (!email || !password || password.length < 8) {
    return NextResponse.json(
      {
        error: "invalid_body",
        message: "Email and password (at least 8 characters) are required.",
      },
      { status: 400 },
    );
  }

  const supabase = await createHomeServerClient();

  if (intent === "sign_up") {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) {
      return NextResponse.json(
        { error: "unauthenticated", message: error.message },
        { status: 401 },
      );
    }
    if (!data.session || !data.user) {
      return NextResponse.json(
        {
          error: "confirm_email",
          message:
            "Check your email to confirm the account, then sign in. (Sandbox: disable Confirm email in Supabase Auth settings.)",
        },
        { status: 401 },
      );
    }
  } else {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      return NextResponse.json(
        { error: "unauthenticated", message: error.message },
        { status: 401 },
      );
    }
  }

  const member = await ensureHomeMember(supabase);
  if ("error" in member) {
    return NextResponse.json(
      {
        error: "unauthenticated",
        message: "Signed in, but household membership could not be linked.",
      },
      { status: 401 },
    );
  }

  return NextResponse.json({ session: member, auth: authMeta() });
}

export async function DELETE() {
  if (!homeDevBypassEnabled() && supabaseConfigured()) {
    try {
      const supabase = await createHomeServerClient();
      await supabase.auth.signOut();
    } catch {
      // still clear bypass cookie below
    }
  }
  await clearHomeSession();
  return NextResponse.json({ ok: true });
}
