import {
  buildWelcomeEmail,
  parseMemberInsert,
  welcomeAuthorized,
} from "../_shared/welcome-email.ts";

/**
 * Welcome email after a household member row is created.
 * Deploy with JWT verification off; the webhook secret is the auth.
 * Secrets (set in the Supabase dashboard, never committed):
 *   RESEND_API_KEY
 *   WELCOME_WEBHOOK_SECRET
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
 */
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method", { status: 405 });
  }

  const secret = Deno.env.get("WELCOME_WEBHOOK_SECRET") ?? "";
  if (!welcomeAuthorized(req.headers.get("authorization"), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = parseMemberInsert(await req.json().catch(() => null));
  if (!parsed) return Response.json({ ignored: true });

  const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!apiKey || !supabaseUrl || !serviceKey) {
    return Response.json({ error: "missing_secret" }, { status: 500 });
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "content-type": "application/json",
  };

  const existing = await fetch(
    `${supabaseUrl}/rest/v1/member_welcome_emails?member_id=eq.${encodeURIComponent(parsed.memberId)}&select=member_id`,
    { headers },
  );
  if (!existing.ok) {
    return Response.json({ error: "claim_read_failed" }, { status: 502 });
  }
  const rows = (await existing.json()) as unknown;
  if (Array.isArray(rows) && rows.length > 0) {
    return Response.json({ duplicate: true });
  }

  const claimed = await fetch(`${supabaseUrl}/rest/v1/member_welcome_emails`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ member_id: parsed.memberId, email: parsed.email }),
  });
  if (claimed.status === 409) return Response.json({ duplicate: true });
  if (!claimed.ok) {
    return Response.json({ error: "claim_write_failed" }, { status: 502 });
  }

  const mail = buildWelcomeEmail(parsed.email);
  const sent = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: mail.from,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    }),
  });

  if (!sent.ok) {
    await fetch(
      `${supabaseUrl}/rest/v1/member_welcome_emails?member_id=eq.${encodeURIComponent(parsed.memberId)}`,
      { method: "DELETE", headers },
    );
    return Response.json({ error: "resend_failed" }, { status: 502 });
  }

  return Response.json({ sent: true });
});
