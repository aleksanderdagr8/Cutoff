import {
  FakeCommitRequestSchema,
  type FakeCommitResponse,
} from "@cutoff/contracts";
import type { ApiBindings } from "../bindings.js";

export type FakeCommitHeaders = {
  idempotencyKey: string | undefined;
};

/**
 * Phase 0 fake commit. Proves idempotency: same key → same order, one row.
 * Not the production /v1/commits path (Units 7–8).
 */
export async function fakeCommitHandler(
  bindings: ApiBindings,
  body: unknown,
  headers: FakeCommitHeaders,
): Promise<FakeCommitResponse | { error: string; status: number }> {
  if (!headers.idempotencyKey) {
    return { error: "missing_idempotency_key", status: 400 };
  }

  const parsed = FakeCommitRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { error: "invalid_body", status: 400 };
  }

  const result = await bindings.orders.commit({
    householdId: parsed.data.household_id,
    canonicalItemId: parsed.data.canonical_item_id,
    quoteId: parsed.data.quote_id,
    amountCents: parsed.data.amount_cents,
    idempotencyKey: headers.idempotencyKey,
  });

  return {
    order_id: result.order.orderId,
    household_id: result.order.householdId,
    amount_cents: result.order.amountCents,
    created: result.created,
  };
}
