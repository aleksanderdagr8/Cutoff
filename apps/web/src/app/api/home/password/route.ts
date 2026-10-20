import { NextResponse } from "next/server";
import { setNewPassword } from "@/lib/home/auth-flow";
import { householdAuthClient } from "@/lib/home/auth-client";
import { homeDevBypassEnabled, supabaseConfigured } from "@/lib/home/config";
import { createHomeServerClient } from "@/lib/home/supabase/server";

export async function POST(request: Request) {
  if (homeDevBypassEnabled() || !supabaseConfigured()) {
    return NextResponse.json(
      { error: "auth_not_configured", message: "Password reset needs Supabase Auth." },
      { status: 503 },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: string };
    if (typeof body.password === "string") password = body.password;
  } catch {
    return NextResponse.json(
      { error: "invalid_body", message: "Expected JSON body." },
      { status: 400 },
    );
  }

  const supabase = await createHomeServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      {
        error: "unauthenticated",
        message: "This reset link is invalid or expired. Request a new one.",
      },
      { status: 401 },
    );
  }

  const result = await setNewPassword(householdAuthClient(supabase), password);
  if (result.ok) return NextResponse.json(result.body);
  return NextResponse.json(result.body, { status: result.status });
}
