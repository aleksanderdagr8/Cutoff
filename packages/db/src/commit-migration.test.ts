import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    import.meta.dirname,
    "../../../supabase/migrations/20261020193151_lock_down_commit_and_rpc_execute.sql",
  ),
  "utf8",
);

describe("lock_down_commit_and_rpc_execute migration", () => {
  it("pins home_new_id search_path and revokes anon execute", () => {
    expect(sql).toMatch(/function public\.home_new_id\(\)[\s\S]*set search_path = ''/);
    expect(sql).toContain(
      "revoke all on function public.home_issue_agent_key(text[]) from public, anon, authenticated",
    );
    expect(sql).toContain(
      "revoke all on function public.home_upsert_mandate(integer, timestamptz, text, text[], text[]) from public, anon, authenticated",
    );
    expect(sql).toContain(
      "revoke all on function public.home_upsert_list_line_internal(text, text, text, integer, boolean) from public, anon, authenticated",
    );
    expect(sql).toContain("revoke all on function public.rls_auto_enable() from public, anon, authenticated");
    expect(sql).not.toContain("grant execute on function public.home_upsert_list_line_internal");
    expect(sql).not.toContain("grant execute on function public.rls_auto_enable");
  });

  it("rejects cross-household writes inside home_upsert_list_line_internal", () => {
    expect(sql).toContain("household_mismatch");
    expect(sql).toContain("caller_household is distinct from p_household_id");
    expect(sql).toContain("auth.uid() is null");
  });

  it("makes quote to order unique and records the commit in one function", () => {
    expect(sql).toContain(
      "create unique index if not exists orders_quote_id_uidx",
    );
    expect(sql).toContain("on public.orders (quote_id)");
    expect(sql).toContain("function public.commit_order_record(");
    expect(sql).toContain("insert into public.orders");
    expect(sql).toContain("insert into public.idempotency_keys");
    expect(sql).toContain("update public.quotes");
    expect(sql).toContain("committed_at_utc");
    expect(sql).toContain("grant execute on function public.commit_order_record(");
    expect(sql).toContain("to service_role");
  });

  it("indexes the foreign keys the performance advisor flagged", () => {
    const indexes = [
      "equivalences_to_canonical_item_id_idx",
      "evidence_agent_key_id_idx",
      "evidence_mandate_id_idx",
      "fulfillment_jobs_household_id_idx",
      "idempotency_keys_order_id_idx",
      "list_lines_canonical_item_id_idx",
      "list_lines_last_order_id_idx",
      "list_lines_last_quote_id_idx",
      "list_lines_mandate_id_idx",
      "merchant_score_events_order_id_idx",
      "orders_canonical_item_id_idx",
      "quote_holds_canonical_item_id_idx",
      "quote_holds_quote_id_idx",
      "quotes_agent_key_id_idx",
      "quotes_canonical_item_id_idx",
      "quotes_mandate_id_idx",
      "quotes_offer_id_idx",
      "refunds_order_id_idx",
      "reorder_nudges_resolved_order_id_idx",
      "return_requests_household_id_idx",
      "return_requests_order_id_idx",
      "shipment_events_job_id_idx",
      "shipment_events_order_id_idx",
    ];
    for (const name of indexes) {
      expect(sql, name).toContain(name);
    }
  });
});
