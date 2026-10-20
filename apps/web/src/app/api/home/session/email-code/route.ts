import { NextResponse } from "next/server";
import { sendLoginCode } from "@/lib/home/auth-flow";
import { householdAuthClient } from "@/lib/home/auth-client";
import { homeDevBypassEnabled, supabaseConfigured } from "@/lib/home/config";
import { createHomeServerClient } from "@/lib/home/supabase/server";

export async function POST() {
  if (homeDevBypassEnabled() || !supabaseConfigured()) {
    return NextResponse.json(
      { error: "auth_not_configured", message: "Auth is not configured." },
      { status: homeDevBypassEnabled() ? 400 : 503 },
    );
  }

  const supabase = await createHomeServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json(
      { error: "unauthenticated", message: "Sign in with your password first." },
      { status: 401 },
    );
  }

  const result = await sendLoginCode(householdAuthClient(supabase), user.email);
  if (result.ok) return NextResponse.json(result.body);
  return NextResponse.json(result.body, { status: result.status });
}
