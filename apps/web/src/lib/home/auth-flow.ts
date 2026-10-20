import type { HomeSession } from "./types";
import {
  afterEmailLink,
  mapSupabaseAuthError,
  messageForOtpReason,
} from "./email-otp";

export type AuthCallError = { message: string };

export type EmailOtpType =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email_change"
  | "email";

export type HouseholdAuthClient = {
  signInWithPassword(input: {
    email: string;
    password: string;
  }): Promise<{ error: AuthCallError | null }>;
  signUp(input: {
    email: string;
    password: string;
    options?: { emailRedirectTo?: string };
  }): Promise<{
    data: { session: unknown; user: unknown } | null;
    error: AuthCallError | null;
  }>;
  reauthenticate(): Promise<{ error: AuthCallError | null }>;
  resetPasswordForEmail(
    email: string,
    opts: { redirectTo: string },
  ): Promise<{ error: AuthCallError | null }>;
  updateUser(input: { password: string }): Promise<{ error: AuthCallError | null }>;
  signOut(): Promise<{ error: AuthCallError | null }>;
  verifyOtp(input: {
    token_hash: string;
    type: EmailOtpType;
  }): Promise<{ error: AuthCallError | null }>;
  exchangeCodeForSession(code: string): Promise<{ error: AuthCallError | null }>;
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: AuthCallError | null }>;
};

export type AuthFlowResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; body: { error: string; message: string } };

const EMAIL_OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

function fail(
  status: number,
  error: string,
  message: string,
): AuthFlowResult {
  return { ok: false, status, body: { error, message } };
}

function reasonOf(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const reason = (data as { reason?: unknown }).reason;
  return typeof reason === "string" ? reason : null;
}

function attemptsOf(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const value = (data as { attempts_left?: unknown }).attempts_left;
  return typeof value === "number" ? value : null;
}

function okOf(data: unknown): boolean {
  return Boolean(data && typeof data === "object" && (data as { ok?: unknown }).ok === true);
}

function memberFromRpc(data: unknown): HomeSession | null {
  if (!data || typeof data !== "object") return null;
  const row = data as {
    member_id?: unknown;
    household_id?: unknown;
    email?: unknown;
    household_name?: unknown;
  };
  if (
    typeof row.member_id !== "string" ||
    typeof row.household_id !== "string" ||
    typeof row.email !== "string" ||
    typeof row.household_name !== "string"
  ) {
    return null;
  }
  return {
    memberId: row.member_id,
    householdId: row.household_id,
    email: row.email,
    householdName: row.household_name,
  };
}

function validEmail(email: string): boolean {
  return email.includes("@") && email.includes(".") && !email.includes(" ");
}

export async function sendLoginCode(
  client: HouseholdAuthClient,
  email: string,
): Promise<AuthFlowResult> {
  const may = await client.rpc("home_email_2fa_may_send");
  if (may.error) {
    await client.signOut();
    return fail(503, "email_code_failed", "We couldn't send a code. Try again.");
  }
  if (!okOf(may.data)) {
    const reason = reasonOf(may.data);
    if (reason !== "rate_limited") await client.signOut();
    const status = reason === "rate_limited" ? 429 : 400;
    return fail(status, reason ?? "email_code_failed", messageForOtpReason(reason));
  }

  const mailed = await client.reauthenticate();
  if (mailed.error) {
    await client.signOut();
    return fail(503, "email_code_failed", mapSupabaseAuthError(mailed.error.message));
  }

  const begin = await client.rpc("home_begin_email_2fa");
  if (begin.error || !okOf(begin.data)) {
    const reason = reasonOf(begin.data);
    if (reason !== "rate_limited") await client.signOut();
    const status = reason === "rate_limited" ? 429 : 503;
    return fail(
      status,
      reason ?? "email_code_failed",
      begin.error
        ? "We couldn't send a code. Try again."
        : messageForOtpReason(reason),
    );
  }

  return { ok: true, body: { step: "email_code", email } };
}

export async function startPasswordSignIn(
  client: HouseholdAuthClient,
  input: { email: string; password: string },
): Promise<AuthFlowResult> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  if (!validEmail(email) || password.length < 8) {
    return fail(
      400,
      "invalid_body",
      "Email and a password of at least 8 characters are required.",
    );
  }

  const signed = await client.signInWithPassword({ email, password });
  if (signed.error) {
    return fail(401, "unauthenticated", mapSupabaseAuthError(signed.error.message));
  }
  return sendLoginCode(client, email);
}

export async function startSignUp(
  client: HouseholdAuthClient,
  input: { email: string; password: string; emailRedirectTo: string },
): Promise<AuthFlowResult> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  if (!validEmail(email) || password.length < 8) {
    return fail(
      400,
      "invalid_body",
      "Email and a password of at least 8 characters are required.",
    );
  }

  const signed = await client.signUp({
    email,
    password,
    options: { emailRedirectTo: input.emailRedirectTo },
  });
  if (signed.error) {
    return fail(400, "sign_up_failed", mapSupabaseAuthError(signed.error.message));
  }
  if (!signed.data?.session) {
    return { ok: true, body: { step: "confirm_email" } };
  }
  return sendLoginCode(client, email);
}

export async function verifyEmailCode(
  client: HouseholdAuthClient,
  code: string,
): Promise<AuthFlowResult> {
  const normalized = code.replace(/\s/g, "");
  if (!/^[0-9]{6}$/.test(normalized)) {
    return fail(400, "invalid_body", "Enter the 6-digit code from the email.");
  }

  const result = await client.rpc("home_verify_email_2fa", { p_code: normalized });
  if (result.error) {
    return fail(503, "email_code_failed", "We couldn't check that code. Try again.");
  }
  if (!okOf(result.data)) {
    const reason = reasonOf(result.data) ?? "mismatch";
    const status = reason === "unauthenticated" || reason === "password_required" ? 401 : 400;
    return fail(status, reason, messageForOtpReason(reason, attemptsOf(result.data)));
  }

  const member = await client.rpc("ensure_home_member");
  const session = memberFromRpc(member.data);
  if (member.error || !session) {
    return fail(
      401,
      "unauthenticated",
      "The code was right, but the household could not be opened. Try again.",
    );
  }
  return { ok: true, body: { step: "signed_in", session } };
}

export async function requestPasswordReset(
  client: HouseholdAuthClient,
  email: string,
  redirectTo: string,
): Promise<AuthFlowResult> {
  const normalized = email.trim().toLowerCase();
  if (!validEmail(normalized)) {
    return fail(400, "invalid_body", "Enter the email on your account.");
  }
  const result = await client.resetPasswordForEmail(normalized, { redirectTo });
  if (result.error && /rate limit|too many/i.test(result.error.message)) {
    return fail(429, "rate_limited", mapSupabaseAuthError(result.error.message));
  }
  return { ok: true, body: { step: "reset_sent" } };
}

export async function setNewPassword(
  client: HouseholdAuthClient,
  password: string,
): Promise<AuthFlowResult> {
  if (password.length < 8) {
    return fail(400, "invalid_body", "Use at least 8 characters.");
  }
  const updated = await client.updateUser({ password });
  if (updated.error) {
    return fail(400, "password_rejected", mapSupabaseAuthError(updated.error.message));
  }
  await client.rpc("home_clear_email_2fa");
  await client.signOut();
  return { ok: true, body: { step: "password_updated" } };
}

export async function endHouseholdAuth(client: HouseholdAuthClient): Promise<void> {
  await client.rpc("home_clear_email_2fa");
  await client.signOut();
}

function asOtpType(type: string | null): EmailOtpType | null {
  if (!type) return null;
  return EMAIL_OTP_TYPES.find((item) => item === type) ?? null;
}

export async function finishEmailLink(
  client: HouseholdAuthClient,
  input: {
    type: string | null;
    next: string | null;
    tokenHash?: string | null;
    code?: string | null;
  },
): Promise<{ redirect: string }> {
  const kind = afterEmailLink(input.type, input.next);
  if (input.tokenHash) {
    const otpType = asOtpType(input.type);
    if (!otpType) return { redirect: "/home/sign-in?error=auth_callback" };
    const result = await client.verifyOtp({
      token_hash: input.tokenHash,
      type: otpType,
    });
    if (result.error) return { redirect: "/home/sign-in?error=auth_callback" };
  } else if (input.code) {
    const result = await client.exchangeCodeForSession(input.code);
    if (result.error) return { redirect: "/home/sign-in?error=auth_callback" };
  } else {
    return { redirect: "/home/sign-in?error=auth_callback" };
  }

  if (kind === "recovery") return { redirect: "/home/reset-password" };
  await client.signOut();
  return { redirect: "/home/sign-in?notice=confirmed" };
}
