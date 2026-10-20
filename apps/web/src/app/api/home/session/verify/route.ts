import { NextResponse } from "next/server";
import { verifyEmailCode } from "@/lib/home/auth-flow";
import { householdAuthClient } from "@/lib/home/auth-client";
import { homeDevBypassEnabled, supabaseConfigured } from "@/lib/home/config";
import { createHomeServerClient } from "@/lib/home/supabase/server";

export async function POST(request: Request) {
  if (homeDevBypassEnabled()) {
    return NextResponse.json(
      { error: "not_used", message: "Local demo sign-in does not use a code." },
      { status: 400 },
    );
  }
  if (!supabaseConfigured()) {
    return NextResponse.json(
      { error: "auth_not_configured", message: "Auth is not configured." },
      { status: 503 },
    );
  }

  let code = "";
  try {
    const body = (await request.json()) as { code?: string };
    if (typeof body.code === "string") code = body.code;
  } catch {
    return NextResponse.json(
      { error: "invalid_body", message: "Expected JSON body." },
      { status: 400 },
    );
  }

  const supabase = await createHomeServerClient();
  const result = await verifyEmailCode(householdAuthClient(supabase), code);
  if (result.ok) return NextResponse.json(result.body);
  return NextResponse.json(result.body, { status: result.status });
}
