/**
 * Quote module repository. Owns immutable `quotes` + household holds.
 * Unit 6: one winner, frozen row, expiry under 10 minutes, hold_active.
 * No placement column — ever.
 */

import { holdKey, quoteExpiresAt, MAX_QUOTE_TTL_MS } from "@cutoff/domain";
import type { MaybePromise } from "./types.js";
import { ulid } from "./ulid.js";

export type QuoteScoreInputs = {
  landedCents: number;
  deliveryDateUtc: string;
  merchantScore: number;
};

export type QuoteSubstituteDiff = {
  fromCanonicalItemId: string;
  toCanonicalItemId: string;
  packCountDelta: number;
  brandFrom: string;
  brandTo: string;
  priceDeltaCents: number;
  dayDelta: number;
  formulaFlag: string | null;
};

/**
 * Immutable quote row. Intentionally has no `placement` field.
 * Schema insert paths reject placement keys.
 */
export type QuoteRow = {
  quoteId: string;
  householdId: string;
  mandateId: string;
  agentKeyId: string;
  canonicalItemId: string;
  qty: number;
  landedCents: number;
  taxCents: number;
  unitPriceCents: number;
  deliveryDateUtc: string;
  fulfillerId: string;
  offerId: string;
  scoreInputs: QuoteScoreInputs;
  addressId: string;
  ceilingCents: number;
  expiresAtUtc: string;
  createdAt: string;
  /** Set when a commit consumes the quote. */
  committedAtUtc: string | null;
  substitute: QuoteSubstituteDiff | null;
};

export type CreateQuoteInput = {
  householdId: string;
  mandateId: string;
  agentKeyId: string;
  canonicalItemId: string;
  qty: number;
  landedCents: number;
  taxCents: number;
  unitPriceCents: number;
  deliveryDateUtc: string;
  fulfillerId: string;
  offerId: string;
  scoreInputs: QuoteScoreInputs;
  addressId: string;
  ceilingCents: number;
  nowUtc: string;
  ttlMs?: number;
  substitute?: QuoteSubstituteDiff | null;
};

export type CreateQuoteResult =
  | { ok: true; quote: QuoteRow }
  | { ok: false; error: "hold_active"; quoteId: string }
  | { ok: false; error: "placement_rejected" };

export type HoldRow = {
  householdId: string;
  canonicalItemId: string;
  quoteId: string;
};

/** Shared surface for memory + Postgres quote repos. */
export interface QuoteRepository {
  attemptInsertWithPlacement(_row: Record<string, unknown>): {
    ok: false;
    error: "placement_rejected";
  };
  create(input: CreateQuoteInput): MaybePromise<CreateQuoteResult>;
  get(quoteId: string): MaybePromise<QuoteRow | null>;
  markCommitted(
    quoteId: string,
    atUtc: string,
  ): MaybePromise<QuoteRow | null>;
  openHold(
    householdId: string,
    canonicalItemId: string,
  ): MaybePromise<HoldRow | null>;
  listAll(): MaybePromise<readonly QuoteRow[]>;
  listOpenHolds(): MaybePromise<readonly HoldRow[]>;
  releaseHold(quoteId: string): MaybePromise<HoldRow | null>;
  schemaHasPlacementColumn(): boolean;
}

export class MemoryQuoteRepository implements QuoteRepository {
  private readonly rows: QuoteRow[] = [];
  private readonly holds = new Map<string, HoldRow>();

  /**
   * Reject any attempt to persist a placement column / preferred flag.
   */
  attemptInsertWithPlacement(_row: Record<string, unknown>): {
    ok: false;
    error: "placement_rejected";
  } {
    void _row;
    return { ok: false, error: "placement_rejected" };
  }

  create(input: CreateQuoteInput): CreateQuoteResult {
    const probe = input as CreateQuoteInput & { placement?: unknown };
    if (probe.placement !== undefined) {
      return { ok: false, error: "placement_rejected" };
    }

    const key = holdKey({
      householdId: input.householdId,
      canonicalItemId: input.canonicalItemId,
    });
    const existingHold = this.holds.get(key);
    if (existingHold) {
      const existing = this.get(existingHold.quoteId);
      if (
        existing &&
        !existing.committedAtUtc &&
        Date.parse(input.nowUtc) < Date.parse(existing.expiresAtUtc)
      ) {
        return {
          ok: false,
          error: "hold_active",
          quoteId: existing.quoteId,
        };
      }
      this.holds.delete(key);
    }

    const ttl = Math.min(input.ttlMs ?? MAX_QUOTE_TTL_MS, MAX_QUOTE_TTL_MS);
    const quote: QuoteRow = {
      quoteId: ulid(),
      householdId: input.householdId,
      mandateId: input.mandateId,
      agentKeyId: input.agentKeyId,
      canonicalItemId: input.canonicalItemId,
      qty: input.qty,
      landedCents: input.landedCents,
      taxCents: input.taxCents,
      unitPriceCents: input.unitPriceCents,
      deliveryDateUtc: input.deliveryDateUtc,
      fulfillerId: input.fulfillerId,
      offerId: input.offerId,
      scoreInputs: { ...input.scoreInputs },
      addressId: input.addressId,
      ceilingCents: input.ceilingCents,
      expiresAtUtc: quoteExpiresAt(input.nowUtc, ttl),
      createdAt: input.nowUtc,
      committedAtUtc: null,
      substitute: input.substitute ?? null,
    };

    this.rows.push(quote);
    this.holds.set(key, {
      householdId: quote.householdId,
      canonicalItemId: quote.canonicalItemId,
      quoteId: quote.quoteId,
    });
    return { ok: true, quote };
  }

  get(quoteId: string): QuoteRow | null {
    return this.rows.find((r) => r.quoteId === quoteId) ?? null;
  }

  markCommitted(quoteId: string, atUtc: string): QuoteRow | null {
    const row = this.get(quoteId);
    if (!row) return null;
    row.committedAtUtc = atUtc;
    const key = holdKey({
      householdId: row.householdId,
      canonicalItemId: row.canonicalItemId,
    });
    const hold = this.holds.get(key);
    if (hold?.quoteId === quoteId) {
      this.holds.delete(key);
    }
    return row;
  }

  openHold(householdId: string, canonicalItemId: string): HoldRow | null {
    return this.holds.get(holdKey({ householdId, canonicalItemId })) ?? null;
  }

  listAll(): readonly QuoteRow[] {
    return this.rows;
  }

  listOpenHolds(): readonly HoldRow[] {
    return [...this.holds.values()];
  }

  /**
   * Operator release-hold: drop the open hold for a quote without committing.
   * Quote row stays immutable; hold lane clears.
   */
  releaseHold(quoteId: string): HoldRow | null {
    const quote = this.get(quoteId);
    if (!quote || quote.committedAtUtc) return null;
    const key = holdKey({
      householdId: quote.householdId,
      canonicalItemId: quote.canonicalItemId,
    });
    const hold = this.holds.get(key);
    if (!hold || hold.quoteId !== quoteId) return null;
    this.holds.delete(key);
    return hold;
  }

  /** Schema probe: quote rows never expose placement. */
  schemaHasPlacementColumn(): boolean {
    return false;
  }
}

/** @deprecated Alias kept so Phase 1 import sites compile during rename. */
export { MemoryQuoteRepository as MemoryStubQuoteRepository };
export type { QuoteRow as StubQuoteRow };
