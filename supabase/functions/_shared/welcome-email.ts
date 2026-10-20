export const WELCOME_FROM = "Cutoff <team@callcutoff.com>";

export type WelcomeEmail = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type MemberInsert = {
  memberId: string;
  email: string;
  householdId: string;
};

export function buildWelcomeEmail(email: string): WelcomeEmail {
  const text = [
    "Welcome to Cutoff.",
    "",
    "Your household is ready. Sign in at https://callcutoff.com/home to set a mandate and issue an agent key.",
    "",
    "This note is only the door. Cutoff stays quiet unless you ask it to write.",
    "",
    "— Cutoff",
    "team@callcutoff.com",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;background:#f5f5f7;color:#1d1d1f;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:480px;margin:0 auto;padding:40px 24px;">
      <p style="margin:0;font-size:22px;letter-spacing:-0.04em;font-weight:700;">CUTOFF</p>
      <h1 style="margin:28px 0 12px;font-size:28px;line-height:1.2;">Welcome</h1>
      <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Your household is ready.</p>
      <p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#6e6e73;">Sign in to set a mandate and issue an agent key.</p>
      <p style="margin:0 0 24px;"><a href="https://callcutoff.com/home" style="color:#1b3a4b;font-size:16px;">Open your household</a></p>
      <p style="margin:0;font-size:13px;line-height:1.5;color:#6e6e73;">This note is only the door. Cutoff stays quiet unless you ask it to write.</p>
    </div>
  </body>
</html>`;

  return {
    from: WELCOME_FROM,
    to: email,
    subject: "Welcome to Cutoff",
    text,
    html,
  };
}

function timingSafeEqual(actual: string, expected: string): boolean {
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/** Bearer token. Empty or short secrets fail closed. */
export function welcomeAuthorized(
  authorization: string | null,
  secret: string,
): boolean {
  if (!secret || secret.length < 16) return false;
  const actual = authorization ?? "";
  return timingSafeEqual(actual, `Bearer ${secret}`);
}

export function parseMemberInsert(body: unknown): MemberInsert | null {
  if (!body || typeof body !== "object") return null;
  const payload = body as {
    type?: unknown;
    table?: unknown;
    record?: unknown;
  };
  if (payload.type !== "INSERT" || payload.table !== "members") return null;
  if (!payload.record || typeof payload.record !== "object") return null;
  const record = payload.record as {
    member_id?: unknown;
    email?: unknown;
    household_id?: unknown;
  };
  if (typeof record.member_id !== "string" || record.member_id.length === 0) {
    return null;
  }
  if (typeof record.household_id !== "string" || record.household_id.length === 0) {
    return null;
  }
  if (typeof record.email !== "string" || !record.email.includes("@")) return null;
  return {
    memberId: record.member_id,
    email: record.email.trim().toLowerCase(),
    householdId: record.household_id,
  };
}
