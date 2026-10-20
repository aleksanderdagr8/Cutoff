import "server-only";

/**
 * Operator `/ops` config.
 *
 * Local `next dev` may use CUTOFF_OPS_DEV_BYPASS=1 (also the default when
 * public Supabase env is missing) for a demo operator cookie.
 * A production build never enables that bypass, even if the var is "1".
 * Put production /ops behind Cloudflare Access (see apps/web/DEPLOY.md).
 */
export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/** Demo operator cookie. Impossible when NODE_ENV is production. */
export function opsDevBypassEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const flag = process.env.CUTOFF_OPS_DEV_BYPASS;
  if (flag === "0" || flag === "false") {
    return !supabaseConfigured();
  }
  if (flag === "1" || flag === "true") return true;
  return !supabaseConfigured();
}

export const OPS_SESSION_COOKIE = "cutoff_ops_session";
