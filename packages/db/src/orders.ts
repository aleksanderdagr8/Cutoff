import type { PayAdapter } from "@cutoff/adapters";
import {
  checkMandateForCommit,
  validateEvidenceFields,
  type MandateSnapshot,
} from "@cutoff/domain";
import { sha256Hex } from "./hash.js";
import { ulid } from "./ulid.js";

export type OrderStatusEvent =
  | "committed"
  | "captured"
  | "failed"
  | "placed"
  | "shipped"
  | "delivered"
  | "refunded";

export type OrderRow = {
  orderId: string;
  householdId: string;
  canonicalItemId: string;
  quoteId: string;
  amountCents: number;
  chargeId: string | null;
  idempotencyKey: string;
  createdAt: string;
  /** Latest status derived from append-only events (convenience). */
  status: OrderStatusEvent;
};

export type OrderEventRow = {
  eventId: string;
  orderId: string;
  status: OrderStatusEvent;
  atUtc: string;
};

export type EvidenceRow = {
  evidenceId: string;
  orderId: string;
  actorChain: string[];
  protocol: string;
  agentKeyId: string;
  mandateId: string;
  quoteHash: string;
  addressId: string;
  amountCents: number;
  createdAt: string;
};

export type ChargeRow = {
  chargeId: string;
  orderId: string;
  amountCents: number;
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

export type EvidencedCommitInput = MandatedCommitInput & {
  actorChain: readonly string[];
  protocol: string;
  agentKeyId: string;
  mandateId: string;
  quoteHashMaterial: string;
};

export type EvidencedCommitResult =
  | { ok: true; order: OrderRow; created: boolean; evidence: EvidenceRow }
  | { ok: false; error: "mandate_miss" };

/**
 * Order repository. Owns orders + append-only order_events + evidence + charges.
 * Unique (household_id, idempotency_key). Pay adapter injected — never Stripe SDK.
 */
export class MemoryOrderRepository {
  private readonly orders: OrderRow[] = [];
  private readonly byIdempotency = new Map<string, OrderRow>();
  private readonly events: OrderEventRow[] = [];
  private readonly evidenceRows: EvidenceRow[] = [];
  private readonly chargeRows: ChargeRow[] = [];
  private seq = 0;

  constructor(private readonly pay: PayAdapter) {}

  private lockKey(householdId: string, idempotencyKey: string): string {
    return `${householdId}::${idempotencyKey}`;
  }

  private appendEvent(
    orderId: string,
    status: OrderStatusEvent,
    atUtc: string,
  ): OrderEventRow {
    const event: OrderEventRow = {
      eventId: ulid(),
      orderId,
      status,
      atUtc,
    };
    this.events.push(event);
    return event;
  }

  /**
   * Phase 0 path: charge + one order row. No evidence (pre–Unit 8).
   */
  async commit(input: CommitInput): Promise<CommitResult> {
    const key = this.lockKey(input.householdId, input.idempotencyKey);
    const existing = this.byIdempotency.get(key);
    if (existing) {
      return { order: existing, created: false };
    }

    this.seq += 1;
    const orderId = `ord_fake_${this.seq}`;
    const nowUtc = new Date().toISOString();

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
      createdAt: nowUtc,
      status: "captured",
    };

    this.appendEvent(orderId, "committed", nowUtc);
    this.appendEvent(orderId, "captured", nowUtc);
    this.chargeRows.push({
      chargeId: charge.chargeId,
      orderId,
      amountCents: charge.amountCents,
      idempotencyKey: input.idempotencyKey,
      createdAt: nowUtc,
    });

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

  /**
   * Phase 3 / Unit 8: evidence in the same transaction as `committed`.
   * Pay amount is always input.amountCents (quote landed). Adapter error →
   * `failed` event, no `captured`, no charge row.
   */
  async commitWithEvidence(
    input: EvidencedCommitInput,
  ): Promise<EvidencedCommitResult> {
    const key = this.lockKey(input.householdId, input.idempotencyKey);
    const existing = this.byIdempotency.get(key);
    if (existing) {
      const evidence =
        this.evidenceRows.find((e) => e.orderId === existing.orderId) ?? null;
      if (!evidence) {
        return { ok: false, error: "mandate_miss" };
      }
      return {
        ok: true,
        order: existing,
        created: false,
        evidence,
      };
    }

    const mandateCheck = checkMandateForCommit({
      mandate: input.mandate,
      canonicalItemId: input.canonicalItemId,
      amountCents: input.amountCents,
      addressId: input.addressId,
      nowUtc: input.nowUtc,
    });
    if (!mandateCheck.ok) {
      return { ok: false, error: "mandate_miss" };
    }

    const quoteHash = await sha256Hex(input.quoteHashMaterial);
    const evidenceCheck = validateEvidenceFields({
      actorChain: input.actorChain,
      protocol: input.protocol,
      agentKeyId: input.agentKeyId,
      mandateId: input.mandateId,
      quoteHash,
      addressId: input.addressId,
      amountCents: input.amountCents,
    });
    if (!evidenceCheck.ok) {
      return { ok: false, error: "mandate_miss" };
    }

    this.seq += 1;
    const orderId = `ord_fake_${this.seq}`;
    const nowUtc = input.nowUtc;

    // Same-transaction: evidence + committed event first (before pay).
    const evidence: EvidenceRow = {
      evidenceId: ulid(),
      orderId,
      actorChain: [...input.actorChain],
      protocol: input.protocol,
      agentKeyId: input.agentKeyId,
      mandateId: input.mandateId,
      quoteHash,
      addressId: input.addressId,
      amountCents: input.amountCents,
      createdAt: nowUtc,
    };
    this.evidenceRows.push(evidence);
    this.appendEvent(orderId, "committed", nowUtc);

    let chargeId: string | null = null;
    let status: OrderStatusEvent = "committed";

    try {
      const charge = await this.pay.charge({
        orderId,
        amountCents: input.amountCents,
        idempotencyKey: input.idempotencyKey,
      });
      chargeId = charge.chargeId;
      this.chargeRows.push({
        chargeId: charge.chargeId,
        orderId,
        amountCents: charge.amountCents,
        idempotencyKey: input.idempotencyKey,
        createdAt: nowUtc,
      });
      this.appendEvent(orderId, "captured", nowUtc);
      status = "captured";
    } catch {
      this.appendEvent(orderId, "failed", nowUtc);
      status = "failed";
    }

    const order: OrderRow = {
      orderId,
      householdId: input.householdId,
      canonicalItemId: input.canonicalItemId,
      quoteId: input.quoteId,
      amountCents: input.amountCents,
      chargeId,
      idempotencyKey: input.idempotencyKey,
      createdAt: nowUtc,
      status,
    };

    this.byIdempotency.set(key, order);
    this.orders.push(order);
    return { ok: true, order, created: true, evidence };
  }

  list(): readonly OrderRow[] {
    return this.orders;
  }

  get(orderId: string): OrderRow | null {
    return this.orders.find((o) => o.orderId === orderId) ?? null;
  }

  listForHousehold(householdId: string): readonly OrderRow[] {
    return this.orders.filter((o) => o.householdId === householdId);
  }

  getForHousehold(
    orderId: string,
    householdId: string,
  ): OrderRow | null {
    const row = this.get(orderId);
    if (!row || row.householdId !== householdId) return null;
    return row;
  }

  count(): number {
    return this.orders.length;
  }

  listEvents(orderId?: string): readonly OrderEventRow[] {
    if (!orderId) return this.events;
    return this.events.filter((e) => e.orderId === orderId);
  }

  getEvidence(orderId: string): EvidenceRow | null {
    return this.evidenceRows.find((e) => e.orderId === orderId) ?? null;
  }

  listCharges(): readonly ChargeRow[] {
    return this.chargeRows;
  }

  chargeCount(): number {
    return this.chargeRows.length;
  }

  /**
   * Append a lifecycle event and update convenience status.
   * Used by fulfill/notify after capture (placed, shipped, refunded, …).
   */
  appendStatus(
    orderId: string,
    status: OrderStatusEvent,
    atUtc: string,
  ): OrderEventRow | null {
    const order = this.get(orderId);
    if (!order) return null;
    const event = this.appendEvent(orderId, status, atUtc);
    order.status = status;
    return event;
  }
}
