import type { PayAdapter } from "@cutoff/adapters";
import {
  checkMandateForCommit,
  type MandateSnapshot,
} from "@cutoff/domain";

export type OrderRow = {
  orderId: string;
  householdId: string;
  canonicalItemId: string;
  quoteId: string;
  amountCents: number;
  chargeId: string;
  idempotencyKey: string;
  createdAt: string;
};

export type CommitInput = {
  householdId: string;
  canonicalItemId: string;
  quoteId: string;
  amountCents: number;
  idempotencyKey: string;
};

export type CommitResult = {
  order: OrderRow;
  created: boolean;
};

export type MandatedCommitInput = CommitInput & {
  mandate: MandateSnapshot;
  addressId: string;
  nowUtc: string;
};

export type MandatedCommitResult =
  | { ok: true; order: OrderRow; created: boolean }
  | { ok: false; error: "mandate_miss" };

/**
 * Order repository. Phase 0/1: in-memory store that enforces
 * unique (household_id, idempotency_key). Live Supabase repos come later;
 * no Supabase client may live outside this package.
 */
export class MemoryOrderRepository {
  private readonly orders: OrderRow[] = [];
  private readonly byIdempotency = new Map<string, OrderRow>();
  private seq = 0;

  constructor(private readonly pay: PayAdapter) {}

  private lockKey(householdId: string, idempotencyKey: string): string {
    return `${householdId}::${idempotencyKey}`;
  }

  async commit(input: CommitInput): Promise<CommitResult> {
    const key = this.lockKey(input.householdId, input.idempotencyKey);
    const existing = this.byIdempotency.get(key);
    if (existing) {
      return { order: existing, created: false };
    }

    this.seq += 1;
    const orderId = `ord_fake_${this.seq}`;

    const charge = await this.pay.charge({
      orderId,
      amountCents: input.amountCents,
      idempotencyKey: input.idempotencyKey,
    });

    const order: OrderRow = {
      orderId,
      householdId: input.householdId,
      canonicalItemId: input.canonicalItemId,
      quoteId: input.quoteId,
      amountCents: input.amountCents,
      chargeId: charge.chargeId,
      idempotencyKey: input.idempotencyKey,
      createdAt: new Date().toISOString(),
    };

    this.byIdempotency.set(key, order);
    this.orders.push(order);
    return { order, created: true };
  }

  /**
   * Phase 1: mandate-gated commit. Over ceiling / expired / miss →
   * mandate_miss and no charge written.
   */
  async commitWithMandate(
    input: MandatedCommitInput,
  ): Promise<MandatedCommitResult> {
    const check = checkMandateForCommit({
      mandate: input.mandate,
      canonicalItemId: input.canonicalItemId,
      amountCents: input.amountCents,
      addressId: input.addressId,
      nowUtc: input.nowUtc,
    });
    if (!check.ok) {
      return { ok: false, error: "mandate_miss" };
    }
    const result = await this.commit(input);
    return { ok: true, order: result.order, created: result.created };
  }

  list(): readonly OrderRow[] {
    return this.orders;
  }

  count(): number {
    return this.orders.length;
  }
}
