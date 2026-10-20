import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    import.meta.dirname,
    "../../../supabase/migrations/20261020211500_household_email_2fa.sql",
  ),
  "utf8",
);

describe("household email 2fa migration", () => {
  it("stores a sha224 hash, limits attempts, and expires in 10 minutes", () => {
    expect(sql).toContain("sha224");
    expect(sql).toContain("interval '10 minutes'");
    expect(sql).toContain("max_attempts integer not null default 5");
    expect(sql).toContain(">= 3 then 'rate_limited'");
    expect(sql).toContain(">= 8 then 'rate_limited'");
    expect(sql).toContain("3f4cef3ebadfa21c8a4559e025966e5806dcc6081d3cf657444c0054");
  });

  it("enables RLS and does not grant the new RPCs to anon", () => {
    expect(sql).toContain("alter table private.email_challenges enable row level security");
    expect(sql).toContain("alter table private.email_2fa_grants enable row level security");
    expect(sql).toContain("alter table public.member_welcome_emails enable row level security");
    expect(sql).toContain(
      "revoke all on function public.home_verify_email_2fa(text) from public, anon, authenticated",
    );
    expect(sql).toContain(
      "grant execute on function public.home_verify_email_2fa(text) to authenticated",
    );
    expect(sql).not.toContain("grant execute on function public.home_verify_email_2fa(text) to anon");
    expect(sql).toContain("grant select, insert, delete on table public.member_welcome_emails to service_role");
  });

  it("blocks household RPCs and rows until the password session is verified", () => {
    expect(sql).toContain("if not public.email_2fa_ok()");
    expect(sql).toContain("as restrictive");
    expect(sql).toContain("elem ->> 'method' = 'password'");
    expect(sql).toContain("'email_2fa_required'");
    const executable = sql.replace(/--[^\n]*/g, "");
    expect(executable).not.toContain("commit_order_record");
    expect(executable).not.toContain("stripe_customer_id");
  });
});
