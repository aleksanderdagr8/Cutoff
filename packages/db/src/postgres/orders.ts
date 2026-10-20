import type { PayAdapter } from "@cutoff/adapters";
import {
  checkMandateForCommit,
  validateEvidenceFields,
} from "@cutoff/domain";
import { sha256Hex } from "../hash.js";
import {
  commitEvidenceThenCapture,
  type ChargeRow,
  type CommitInput,
  type CommitResult,
  type EvidenceRow,
  type EvidencedCommitInput,
  type EvidencedCommitResult,
  type MandatedCommitInput,
  type MandatedCommitResult,
  type OrderEventRow,
  type OrderRepository,
  type OrderRow,
  type OrderStatusEvent,
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

function isUniqueViolation(
  error: { message: string; code?: string } | null,
): boolean {
  if (!error) return false;
  return (
    error.code === "23505" || error.message.toLowerCase().includes("duplicate")
  );
}

/**
 * Thin Postgres order / ledger / evidence / charge store.
 * The commit record (order + evidence + idempotency key + quote used) is one
 * `commit_order_record` transaction. Capture and place run after that and
 * retry on order id.
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

  private async findByQuoteId(quoteId: string): Promise<OrderRow | null> {
    const { data, error } = await this.db
      .from("orders")
      .select("*")
      .eq("quote_id", quoteId)
      .maybeSingle();
    throwOnError(error, "orders.findByQuoteId");
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
    const existing =
      (await this.findByIdempotency(
        input.householdId,
        input.idempotencyKey,
      )) ?? (await this.findByQuoteId(input.quoteId));
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
    if (isUniqueViolation(error)) {
      const raced =
        (await this.findByIdempotency(
          input.householdId,
          input.idempotencyKey,
        )) ?? (await this.findByQuoteId(input.quoteId));
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

  async recordEvidencedCommit(
    input: EvidencedCommitInput,
  ): Promise<EvidencedCommitResult> {
    const existing =
      (await this.findByIdempotency(
        input.householdId,
        input.idempotencyKey,
      )) ?? (await this.findByQuoteId(input.quoteId));
    if (existing) {
      const evidence = await this.getEvidence(existing.orderId);
      if (!evidence) return { ok: false, error: "mandate_miss" };
      return { ok: true, order: existing, created: false, evidence };
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
    const evidenceId = ulid();
    const eventId = ulid();
    const { data, error } = await this.db.rpc("commit_order_record", {
      p_order_id: orderId,
      p_household_id: input.householdId,
      p_canonical_item_id: input.canonicalItemId,
      p_quote_id: input.quoteId,
      p_amount_cents: input.amountCents,
      p_idempotency_key: input.idempotencyKey,
      p_now: input.nowUtc,
      p_event_id: eventId,
      p_evidence_id: evidenceId,
      p_actor_chain: [...input.actorChain],
      p_protocol: input.protocol,
      p_agent_key_id: input.agentKeyId,
      p_mandate_id: input.mandateId,
      p_quote_hash: quoteHash,
      p_address_id: input.addressId,
    });
    throwOnError(error, "commit_order_record");

    const payload = data as { created?: boolean; order_id?: string } | null;
    const storedId = payload?.order_id;
    if (!storedId || typeof payload?.created !== "boolean") {
      throw new Error("commit_order_record: missing order_id");
    }

    const order = await this.get(storedId);
    if (!order) throw new Error("commit_order_record: row missing after rpc");
    const evidence = await this.getEvidence(order.orderId);
    if (!evidence) {
      return { ok: false, error: "mandate_miss" };
    }
    return {
      ok: true,
      order,
      created: payload.created,
      evidence,
    };
  }

  /**
   * Charge keyed on order id. Unique charges.order_id plus the pay adapter
   * key keep a retry from writing a second charge.
   */
  async captureOrder(orderId: string, atUtc: string): Promise<OrderRow | null> {
    const order = await this.get(orderId);
    if (!order) return null;
    if (order.chargeId || order.status !== "committed") return order;

    let chargeId: string;
    let amountCents: number;
    try {
      const charge = await this.pay.charge({
        orderId: order.orderId,
        amountCents: order.amountCents,
        idempotencyKey: order.orderId,
      });
      chargeId = charge.chargeId;
      amountCents = charge.amountCents;
    } catch {
      const { data: failed, error: failError } = await this.db
        .from("orders")
        .update({ status: "failed", charge_id: null })
        .eq("order_id", orderId)
        .eq("status", "committed")
        .select("order_id");
      throwOnError(failError, "orders.captureFailed");
      if (Array.isArray(failed) && failed.length > 0) {
        await this.insertEvent(orderId, "failed", atUtc);
      }
      return this.get(orderId);
    }

    const { error: chargeError } = await this.db.from("charges").insert({
      charge_id: chargeId,
      order_id: orderId,
      amount_cents: amountCents,
      idempotency_key: orderId,
      created_at: atUtc,
    });
    if (!isUniqueViolation(chargeError)) {
      throwOnError(chargeError, "charges.insert");
    }

    const { data: updated, error: statusError } = await this.db
      .from("orders")
      .update({ charge_id: chargeId, status: "captured" })
      .eq("order_id", orderId)
      .eq("status", "committed")
      .select("order_id");
    throwOnError(statusError, "orders.capture");
    if (Array.isArray(updated) && updated.length > 0) {
      await this.insertEvent(orderId, "captured", atUtc);
    }
    return this.get(orderId);
  }

  async commitWithEvidence(
    input: EvidencedCommitInput,
  ): Promise<EvidencedCommitResult> {
    return commitEvidenceThenCapture(this, input);
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
