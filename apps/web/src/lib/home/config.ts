import "server-only";

/**
 * Household `/home` config.
 *
 * Live Supabase Auth is parked until project secrets exist.
 * Set CUTOFF_HOME_DEV_BYPASS=1 (default when Supabase public URL/anon
 * are missing) to use the local member session + in-memory fakes.
 */
export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/** Dev bypass is on unless explicitly disabled when Supabase is configured. */
export function homeDevBypassEnabled(): boolean {
  const flag = process.env.CUTOFF_HOME_DEV_BYPASS;
  if (flag === "0" || flag === "false") {
    return !supabaseConfigured() ? true : false;
  }
  if (flag === "1" || flag === "true") return true;
  // Default: bypass when secrets are absent so local UI always runs.
  return !supabaseConfigured();
}

export const HOME_SESSION_COOKIE = "cutoff_home_session";
