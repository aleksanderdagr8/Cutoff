import { NextResponse } from "next/server";
import { ensureHomeMember } from "@/lib/home/member";
import { createHomeServerClient } from "@/lib/home/supabase/server";

/**
 * Supabase email-confirm / OAuth-style code exchange for /home.
 * Password sign-in usually skips this; keep for confirm-email redirects.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/home/list";

  if (code) {
    const supabase = await createHomeServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await ensureHomeMember(supabase);
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }

  return NextResponse.redirect(
    new URL("/home/sign-in?error=auth_callback", url.origin),
  );
}
