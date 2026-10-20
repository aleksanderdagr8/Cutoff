import { NextResponse } from "next/server";
import { requestPasswordReset } from "@/lib/home/auth-flow";
import { householdAuthClient } from "@/lib/home/auth-client";
import { requestOrigin } from "@/lib/home/email-otp";
import { homeDevBypassEnabled, supabaseConfigured } from "@/lib/home/config";
import { createHomeServerClient } from "@/lib/home/supabase/server";

export async function POST(request: Request) {
  if (homeDevBypassEnabled() || !supabaseConfigured()) {
    return NextResponse.json(
      {
        error: "auth_not_configured",
        message: "Password reset needs Supabase Auth.",
      },
      { status: 503 },
    );
  }

  let email = "";
  try {
    const body = (await request.json()) as { email?: string };
    if (typeof body.email === "string") email = body.email;
  } catch {
    return NextResponse.json(
      { error: "invalid_body", message: "Expected JSON body." },
      { status: 400 },
    );
  }

  const origin = requestOrigin(request);
  const supabase = await createHomeServerClient();
  const result = await requestPasswordReset(
    householdAuthClient(supabase),
    email,
    `${origin}/home/auth/callback?next=/home/reset-password`,
  );
  if (result.ok) return NextResponse.json(result.body);
  return NextResponse.json(result.body, { status: result.status });
}
