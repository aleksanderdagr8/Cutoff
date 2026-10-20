import { NextResponse } from "next/server";
import { finishEmailLink } from "@/lib/home/auth-flow";
import { householdAuthClient } from "@/lib/home/auth-client";
import { createHomeServerClient } from "@/lib/home/supabase/server";

/**
 * PKCE / code exchange for confirm and recovery links.
 * A confirmation does not open the household: the session is signed out
 * so the next step is password, then the email code.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const supabase = await createHomeServerClient();
  const result = await finishEmailLink(householdAuthClient(supabase), {
    type: url.searchParams.get("type"),
    next: url.searchParams.get("next"),
    code: url.searchParams.get("code"),
  });
  return NextResponse.redirect(new URL(result.redirect, url.origin));
}
