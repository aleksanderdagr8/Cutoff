import { NextResponse } from "next/server";
import { finishEmailLink } from "@/lib/home/auth-flow";
import { householdAuthClient } from "@/lib/home/auth-client";
import { createHomeServerClient } from "@/lib/home/supabase/server";

/**
 * token_hash landing for Auth email templates. Works when the link is opened
 * on a different device than the one that requested it.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const supabase = await createHomeServerClient();
  const result = await finishEmailLink(householdAuthClient(supabase), {
    type: url.searchParams.get("type"),
    next: url.searchParams.get("next"),
    tokenHash: url.searchParams.get("token_hash"),
  });
  return NextResponse.redirect(new URL(result.redirect, url.origin));
}
