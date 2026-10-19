import type { PayAdapter } from "@cutoff/adapters";
import {
  checkMandateForCommit,
  validateEvidenceFields,
} from "@cutoff/domain";
import { sha256Hex } from "../hash.js";
import type {
  ChargeRow,
  CommitInput,
  CommitResult,
  EvidenceRow,
  EvidencedCommitInput,
  EvidencedCommitResult,
  MandatedCommitInput,
  MandatedCommitResult,
  OrderEventRow,
  OrderRepository,
  OrderRow,
  OrderStatusEvent,
} from "../orders.js";
import type { CutoffSupabaseClient } from "../supabase-client.js";
import { ulid } from "../ulid.js";
import {
  mapCharge,
  mapEvidence,
  mapOrder,
  mapOrderEvent,
  throwOnError,
  type DbCharge,
  type DbEvidence,
  type DbOrder,
  type DbOrderEvent,
} from "./mappers.js";

/**
 * Thin Postgres order / ledger / evidence / charge store.
 * Writes are sequential over the Data API (not a single SQL transaction).
 * Idempotency relies on unique (household_id, idempotency_key).
 */
export class PostgresOrderRepository implements OrderRepository {
  constructor(
    private readonly db: CutoffSupabaseClient,
    private readonly pay: PayAdapter,
  ) {}

  private async findByIdempotency(
    householdId: string,
    idempotencyKey: string,
  ): Promise<OrderRow | null> {
    const { data, error } = await this.db
      .from("orders")
      .select("*")
      .eq("household_id", householdId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    throwOnError(error, "orders.findByIdempotency");
    if (!data) return null;
    return mapOrder(data as DbOrder);
  }

  private async insertEvent(
    orderId: string,
    status: OrderStatusEvent,
    atUtc: string,
  ): Promise<OrderEventRow> {
    const eventId = ulid();
    const { error } = await this.db.from("order_events").insert({
      event_id: eventId,
      order_id: orderId,
      status,
      at_utc: atUtc,
    });
    throwOnError(error, "order_events.insert");
    return { eventId, orderId, status, atUtc };
  }

  async commit(input: CommitInput): Promise<CommitResult> {
    const existing = await this.findByIdempotency(
      input.householdId,
      input.idempotencyKey,
    );
    if (existing) {
      return { order: existing, created: false };
    }

    const orderId = `ord_${ulid()}`;
    const nowUtc = new Date().toISOString();

    const charge = await this.pay.charge({
      orderId,
      amountCents: input.amountCents,
      idempotencyKey: input.idempotencyKey,
    });

    const { error } = await this.db.from("orders").insert({
      order_id: orderId,
      household_id: input.householdId,
      canonical_item_id: input.canonicalItemId,
      quote_id: input.quoteId,
      amount_cents: input.amountCents,
      charge_id: charge.chargeId,
      idempotency_key: input.idempotencyKey,
      status: "captured",
      created_at: nowUtc,
    });
    if (
      error &&
      (error.message.includes("duplicate") ||
        ("code" in error && error.code === "23505"))
    ) {
      const raced = await this.findByIdempotency(
        input.householdId,
        input.idempotencyKey,
      );
      if (raced) return { order: raced, created: false };
    }
    throwOnError(error, "orders.insert");

    await this.insertEvent(orderId, "committed", nowUtc);
    await this.insertEvent(orderId, "captured", nowUtc);

    const { error: chargeError } = await this.db.from("charges").insert({
      charge_id: charge.chargeId,
      order_id: orderId,
      amount_cents: charge.amountCents,
      idempotency_key: input.idempotencyKey,
      created_at: nowUtc,
    });
    throwOnError(chargeError, "charges.insert");

    const { error: edgeError } = await this.db.from("idempotency_keys").insert({
      household_id: input.householdId,
      idempotency_key: input.idempotencyKey,
      order_id: orderId,
      created_at: nowUtc,
    });
    throwOnError(edgeError, "idempotency_keys.insert");

    const order = await this.get(orderId);
    if (!order) throw new Error("orders.insert: row missing after insert");
    return { order, created: true };
  }

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

  async commitWithEvidence(
    input: EvidencedCommitInput,
  ): Promise<EvidencedCommitResult> {
    const existing = await this.findByIdempotency(
      input.householdId,
      input.idempotencyKey,
    );
    if (existing) {
      const evidence = await this.getEvidence(existing.orderId);
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

    const orderId = `ord_${ulid()}`;
    const nowUtc = input.nowUtc;
    const evidenceId = ulid();

    // Insert order first (status committed), then evidence + event, then pay.
    const { error: orderError } = await this.db.from("orders").insert({
      order_id: orderId,
      household_id: input.householdId,
      canonical_item_id: input.canonicalItemId,
      quote_id: input.quoteId,
      amount_cents: input.amountCents,
      charge_id: null,
      idempotency_key: input.idempotencyKey,
      status: "committed",
      created_at: nowUtc,
    });
    if (
      orderError &&
      (orderError.message.includes("duplicate") ||
        ("code" in orderError && orderError.code === "23505"))
    ) {
      const raced = await this.findByIdempotency(
        input.householdId,
        input.idempotencyKey,
      );
      if (raced) {
        const evidence = await this.getEvidence(raced.orderId);
        if (!evidence) return { ok: false, error: "mandate_miss" };
        return {
          ok: true,
          order: raced,
          created: false,
          evidence,
        };
      }
    }
    throwOnError(orderError, "orders.insert");

    const evidence: EvidenceRow = {
      evidenceId,
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
    const { error: evidenceError } = await this.db.from("evidence").insert({
      evidence_id: evidence.evidenceId,
      order_id: evidence.orderId,
      actor_chain: evidence.actorChain,
      protocol: evidence.protocol,
      agent_key_id: evidence.agentKeyId,
      mandate_id: evidence.mandateId,
      quote_hash: evidence.quoteHash,
      address_id: evidence.addressId,
      amount_cents: evidence.amountCents,
      created_at: evidence.createdAt,
    });
    throwOnError(evidenceError, "evidence.insert");
    await this.insertEvent(orderId, "committed", nowUtc);

    let chargeId: string | null = null;
    let status: OrderStatusEvent = "committed";

    try {
      const charge = await this.pay.charge({
        orderId,
        amountCents: input.amountCents,
        idempotencyKey: input.idempotencyKey,
      });
      chargeId = charge.chargeId;
      const { error: chargeError } = await this.db.from("charges").insert({
        charge_id: charge.chargeId,
        order_id: orderId,
        amount_cents: charge.amountCents,
        idempotency_key: input.idempotencyKey,
        created_at: nowUtc,
      });
      throwOnError(chargeError, "charges.insert");
      await this.insertEvent(orderId, "captured", nowUtc);
      status = "captured";
    } catch {
      await this.insertEvent(orderId, "failed", nowUtc);
      status = "failed";
    }

    const { error: statusError } = await this.db
      .from("orders")
      .update({ charge_id: chargeId, status })
      .eq("order_id", orderId);
    throwOnError(statusError, "orders.updateStatus");

    const { error: edgeError } = await this.db.from("idempotency_keys").insert({
      household_id: input.householdId,
      idempotency_key: input.idempotencyKey,
      order_id: orderId,
      created_at: nowUtc,
    });
    throwOnError(edgeError, "idempotency_keys.insert");

    const order = await this.get(orderId);
    if (!order) throw new Error("orders.insert: row missing after insert");
    return { ok: true, order, created: true, evidence };
  }

  async list(): Promise<readonly OrderRow[]> {
    const { data, error } = await this.db.from("orders").select("*");
    throwOnError(error, "orders.list");
    return ((data ?? []) as DbOrder[]).map(mapOrder);
  }

  async get(orderId: string): Promise<OrderRow | null> {
    const { data, error } = await this.db
      .from("orders")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();
    throwOnError(error, "orders.get");
    if (!data) return null;
    return mapOrder(data as DbOrder);
  }

  async listForHousehold(householdId: string): Promise<readonly OrderRow[]> {
    const { data, error } = await this.db
      .from("orders")
      .select("*")
      .eq("household_id", householdId);
    throwOnError(error, "orders.listForHousehold");
    return ((data ?? []) as DbOrder[]).map(mapOrder);
  }

  async getForHousehold(
    orderId: string,
    householdId: string,
  ): Promise<OrderRow | null> {
    const row = await this.get(orderId);
    if (!row || row.householdId !== householdId) return null;
    return row;
  }

  async count(): Promise<number> {
    const { count, error } = await this.db
      .from("orders")
      .select("*", { count: "exact", head: true });
    throwOnError(error, "orders.count");
    return count ?? 0;
  }

  async listEvents(orderId?: string): Promise<readonly OrderEventRow[]> {
    let query = this.db.from("order_events").select("*");
    if (orderId) query = query.eq("order_id", orderId);
    const { data, error } = await query;
    throwOnError(error, "order_events.list");
    return ((data ?? []) as DbOrderEvent[]).map(mapOrderEvent);
  }

  async getEvidence(orderId: string): Promise<EvidenceRow | null> {
    const { data, error } = await this.db
      .from("evidence")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();
    throwOnError(error, "evidence.get");
    if (!data) return null;
    return mapEvidence(data as DbEvidence);
  }

  async listCharges(): Promise<readonly ChargeRow[]> {
    const { data, error } = await this.db.from("charges").select("*");
    throwOnError(error, "charges.list");
    return ((data ?? []) as DbCharge[]).map(mapCharge);
  }

  async chargeCount(): Promise<number> {
    const { count, error } = await this.db
      .from("charges")
      .select("*", { count: "exact", head: true });
    throwOnError(error, "charges.count");
    return count ?? 0;
  }

  async appendStatus(
    orderId: string,
    status: OrderStatusEvent,
    atUtc: string,
  ): Promise<OrderEventRow | null> {
    const order = await this.get(orderId);
    if (!order) return null;
    const event = await this.insertEvent(orderId, status, atUtc);
    const { error } = await this.db
      .from("orders")
      .update({ status })
      .eq("order_id", orderId);
    throwOnError(error, "orders.appendStatus");
    return event;
  }
}
