import "server-only";

/**
 * Operator `/ops` config.
 *
 * Live operator Auth + TOTP is parked (see docs/user-tasks).
 * Set CUTOFF_OPS_DEV_BYPASS=1 (default when Supabase public URL/anon
 * are missing) to use the local operator session + in-memory fakes.
 */
export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/** Dev bypass is on unless explicitly disabled when Supabase is configured. */
export function opsDevBypassEnabled(): boolean {
  const flag = process.env.CUTOFF_OPS_DEV_BYPASS;
  if (flag === "0" || flag === "false") {
    return !supabaseConfigured() ? true : false;
  }
  if (flag === "1" || flag === "true") return true;
  return !supabaseConfigured();
}

export const OPS_SESSION_COOKIE = "cutoff_ops_session";
