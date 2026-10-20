/**
 * Household `/home` config.

 *
 * Live path: NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY and
 * CUTOFF_HOME_DEV_BYPASS left unset/0 → Supabase Auth (email + password).
 *
 * Escape hatch: CUTOFF_HOME_DEV_BYPASS=1 → local cookie demo + in-memory fakes
 * (CI / no Auth). When public Supabase env is missing, bypass stays on
 * automatically even if the flag is 0. A production build never enables it.
 */
export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
}

/** Dev bypass is on unless Auth env is present and bypass is explicitly off. */
export function homeDevBypassEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const flag = process.env.CUTOFF_HOME_DEV_BYPASS;
  if (flag === "0" || flag === "false") {
    // Cannot require Auth without public keys — keep local UI usable.
    return !supabaseConfigured();
  }
  if (flag === "1" || flag === "true") return true;
  // Default: bypass only when secrets are absent.
  return !supabaseConfigured();
}

export const HOME_SESSION_COOKIE = "cutoff_home_session";
