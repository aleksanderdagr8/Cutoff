/**
 * Google Analytics (gtag.js) measurement ID.
 *
 * Build-time: set NEXT_PUBLIC_GA_MEASUREMENT_ID so Next inlines it into the
 * client bundle (required for OpenNext / Workers deploys).
 * Runtime: same name in wrangler `vars` keeps server reads consistent.
 *
 * Default is the production property Aleks provided. Set the env to an empty
 * string to disable the tag locally.
 */
export const DEFAULT_GA_MEASUREMENT_ID = "G-3K4P4MPMPD";

export function getGaMeasurementId(): string | null {
  const raw = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  if (raw === undefined || raw === null) {
    return DEFAULT_GA_MEASUREMENT_ID;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Operator console — skip GA (internal tooling, not marketing/household). */
export function shouldTrackPath(pathname: string): boolean {
  return !pathname.startsWith("/ops");
}
