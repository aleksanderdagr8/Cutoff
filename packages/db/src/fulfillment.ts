/**
 * Fulfill module repository. Owns fulfillment_jobs, shipment_events, refunds.
 * No cross-module table reads — callers pass order facts in.
 */

import { acceptInboundShipmentEvent, isLateShip } from "@cutoff/domain";
import { ulid } from "./ulid.js";

export type FulfillmentJobRow = {
  jobId: string;
  orderId: string;
  householdId: string;
  fulfillerId: string;
  status: "accepted" | "cancelled" | "failed";
  createdAt: string;
};

export type ShipmentEventRow = {
  id: string;
  /** External fulfiller event id — unique for dedupe. */
  externalEventId: string;
  orderId: string;
  jobId: string;
  status: "shipped" | "delivered" | "cancelled" | "tracking_update";
  trackingNumber: string | null;
  atUtc: string;
  createdAt: string;
};

export type RefundQueueRow = {
  refundId: string;
  orderId: string;
  amountCents: number;
  reason: "place_failed" | "cancel_before_ship" | "human" | "risk";
  createdAt: string;
  status: "queued" | "completed";
};

export type InboundShipmentInput = {
  externalEventId: string;
  orderId: string;
  jobId: string;
  status: ShipmentEventRow["status"];
  trackingNumber: string | null;
  eventTimestampUtc: string;
  nowUtc: string;
  /** Promised delivery date on the quote — used for late-ship strike. */
  promisedDeliveryDateUtc?: string;
};

export type InboundShipmentResult =
  | { ok: true; event: ShipmentEventRow; created: boolean; lateShip: boolean }
  | { ok: false; error: "duplicate" | "replay_window" | "bad_timestamp" };

export class MemoryFulfillmentRepository {
  private readonly jobs: FulfillmentJobRow[] = [];
  private readonly shipmentEvents: ShipmentEventRow[] = [];
  private readonly refunds: RefundQueueRow[] = [];
  private readonly seenExternalIds = new Set<string>();
  private readonly byOrder = new Map<string, FulfillmentJobRow>();

  recordJob(input: {
    jobId: string;
    orderId: string;
    householdId: string;
    fulfillerId: string;
    nowUtc: string;
  }): FulfillmentJobRow {
    const row: FulfillmentJobRow = {
      jobId: input.jobId,
      orderId: input.orderId,
      householdId: input.householdId,
      fulfillerId: input.fulfillerId,
      status: "accepted",
      createdAt: input.nowUtc,
    };
    this.jobs.push(row);
    this.byOrder.set(input.orderId, row);
    return row;
  }

  getJobForOrder(orderId: string): FulfillmentJobRow | null {
    return this.byOrder.get(orderId) ?? null;
  }

  getJob(jobId: string): FulfillmentJobRow | null {
    return this.jobs.find((j) => j.jobId === jobId) ?? null;
  }

  markJobCancelled(jobId: string): void {
    const job = this.getJob(jobId);
    if (job) job.status = "cancelled";
  }

  enqueueRefund(input: {
    orderId: string;
    amountCents: number;
    reason: RefundQueueRow["reason"];
    nowUtc: string;
  }): RefundQueueRow {
    const row: RefundQueueRow = {
      refundId: ulid(),
      orderId: input.orderId,
      amountCents: input.amountCents,
      reason: input.reason,
      createdAt: input.nowUtc,
      status: "queued",
    };
    this.refunds.push(row);
    return row;
  }

  listRefunds(orderId?: string): readonly RefundQueueRow[] {
    if (!orderId) return this.refunds;
    return this.refunds.filter((r) => r.orderId === orderId);
  }

  /**
   * Verified inbound webhook body → one shipment_events row.
   * Dedupe on external event id; replay window enforced in domain.
   */
  ingestInbound(input: InboundShipmentInput): InboundShipmentResult {
    const accept = acceptInboundShipmentEvent({
      eventId: input.externalEventId,
      eventTimestampUtc: input.eventTimestampUtc,
      nowUtc: input.nowUtc,
      seenEventIds: this.seenExternalIds,
    });
    if (!accept.ok) {
      if (accept.reason === "duplicate") {
        const existing = this.shipmentEvents.find(
          (e) => e.externalEventId === input.externalEventId,
        )!;
        return {
          ok: true,
          event: existing,
          created: false,
          lateShip: false,
        };
      }
      return { ok: false, error: accept.reason };
    }

    this.seenExternalIds.add(input.externalEventId);
    const event: ShipmentEventRow = {
      id: ulid(),
      externalEventId: input.externalEventId,
      orderId: input.orderId,
      jobId: input.jobId,
      status: input.status,
      trackingNumber: input.trackingNumber,
      atUtc: input.eventTimestampUtc,
      createdAt: input.nowUtc,
    };
    this.shipmentEvents.push(event);

    const lateShip =
      input.status === "shipped" &&
      input.promisedDeliveryDateUtc !== undefined &&
      isLateShip(input.promisedDeliveryDateUtc, input.eventTimestampUtc);

    return { ok: true, event, created: true, lateShip };
  }

  listShipmentEvents(orderId: string): readonly ShipmentEventRow[] {
    return this.shipmentEvents.filter((e) => e.orderId === orderId);
  }

  listJobs(): readonly FulfillmentJobRow[] {
    return this.jobs;
  }
}
