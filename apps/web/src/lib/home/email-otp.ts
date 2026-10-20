import { createHash } from "node:crypto";

/** Keep these in sync with supabase/migrations/20261020211500_household_email_2fa.sql */
export const EMAIL_OTP_MAX_ATTEMPTS = 5;
export const EMAIL_OTP_TTL_MINUTES = 10;
export const EMAIL_OTP_MAX_SENDS_PER_15_MIN = 3;
export const EMAIL_OTP_MAX_SENDS_PER_DAY = 8;

/**
 * GoTrue reauthentication hash: hex SHA-224 of email concatenated with the OTP.
 * Vector: gotrue@testing.email.ai.moda + 131337
 * → 3f4cef3ebadfa21c8a4559e025966e5806dcc6081d3cf657444c0054
 */
export function gotrueReauthenticationHash(email: string, code: string): string {
  return createHash("sha224").update(`${email}${code}`, "utf8").digest("hex");
}

export function messageForOtpReason(
  reason: string | null,
  attemptsLeft?: number | null,
): string {
  if (reason === "mismatch") {
    if (attemptsLeft === 1) return "That code doesn't match. 1 try left.";
    if (typeof attemptsLeft === "number" && attemptsLeft > 1) {
      return `That code doesn't match. ${attemptsLeft} tries left.`;
    }
    return "That code doesn't match.";
  }
  if (reason === "expired") return "That code expired. Request a new one.";
  if (reason === "locked") return "Too many tries. Request a new code.";
  if (reason === "rate_limited") {
    return "Too many codes. Wait a few minutes and try again.";
  }
  if (reason === "missing" || reason === "code_not_ready") {
    return "Request a new code.";
  }
  if (reason === "password_required") {
    return "Sign in with your password first.";
  }
  return "We couldn't check that code. Try again.";
}

export function mapSupabaseAuthError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("invalid login") || text.includes("invalid credentials")) {
    return "That email and password don't match.";
  }
  if (text.includes("email not confirmed")) {
    return "Confirm your email, then sign in.";
  }
  if (text.includes("already registered") || text.includes("already been registered")) {
    return "An account with that email already exists. Sign in instead.";
  }
  if (text.includes("rate limit") || text.includes("too many")) {
    return "Too many attempts. Wait a few minutes and try again.";
  }
  if (text.includes("password")) return "Use at least 8 characters.";
  return "Something went wrong. Try again.";
}

/** Only same-origin paths. Rejects protocol-relative and absolute URLs. */
export function safeInternalPath(next: string | null, fallback: string): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  if (next.includes("\\") || next.includes("://")) return fallback;
  return next;
}

export function afterEmailLink(
  type: string | null,
  next: string | null,
): "recovery" | "confirmed" {
  if (type === "recovery") return "recovery";
  const safe = safeInternalPath(next, "");
  if (
    safe === "/home/reset-password" ||
    safe.startsWith("/home/reset-password?")
  ) {
    return "recovery";
  }
  return "confirmed";
}

export function requestOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();
  if (host) {
    const hostname = host.split(":")[0]?.toLowerCase();
    if (hostname === "callcutoff.com" || hostname === "www.callcutoff.com") {
      return "https://callcutoff.com";
    }
    const proto =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    return `${proto}://${host}`;
  }
  return new URL(request.url).origin;
}
