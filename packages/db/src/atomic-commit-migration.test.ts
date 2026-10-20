import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    import.meta.dirname,
    "../../../supabase/migrations/20261020212010_atomic_quote_commit.sql",
  ),
  "utf8",
);

describe("atomic quote commit migration", () => {
  it("keeps one order per quote and one idempotent commit function", () => {
    expect(sql).toContain(
      "create unique index if not exists orders_quote_id_uidx",
    );
    expect(sql).toContain("on public.orders (quote_id)");
    expect(sql).toContain("function public.commit_order_record(");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("for update");
    expect(sql).toContain("insert into public.evidence");
    expect(sql).toContain("insert into public.order_events");
    expect(sql).toContain("insert into public.idempotency_keys");
    expect(sql).toContain("when unique_violation then");
    expect(sql).toContain(
      "grant execute on function public.commit_order_record(",
    );
    expect(sql).toContain("to service_role");
  });

  it("does not grant the commit function to anon or authenticated", () => {
    expect(sql).toContain(
      "revoke all on function public.commit_order_record(",
    );
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).not.toMatch(
      /grant execute on function public\.commit_order_record\([\s\S]*to anon/,
    );
    expect(sql).not.toMatch(
      /grant execute on function public\.commit_order_record\([\s\S]*to authenticated/,
    );
  });

  it("blocks updates and deletes on the ledger and the evidence pack", () => {
    expect(sql).toContain("function public.reject_ledger_mutation()");
    expect(sql).toContain("raise exception 'append_only'");
    expect(sql).toContain("before update or delete on public.order_events");
    expect(sql).toContain("before update or delete on public.evidence");
    expect(sql).toContain("before truncate on public.order_events");
    expect(sql).toContain("before truncate on public.evidence");
    expect(sql).toContain("set search_path = ''");
  });

  it("leaves household auth functions alone", () => {
    expect(sql).not.toContain("home_upsert_list_line");
    expect(sql).not.toContain("home_issue_agent_key");
    expect(sql).not.toContain("ensure_home_member");
    expect(sql).not.toContain("home_new_id");
  });
});
