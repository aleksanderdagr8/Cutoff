/**
 * Phase 1 stub quote store. Full immutable quote module arrives in Unit 6.
 * Kept here so commit can re-read the frozen amount without catalog.
 */

import { ulid } from "./ulid.js";

export type StubQuoteRow = {
  quoteId: string;
  householdId: string;
  mandateId: string;
  agentKeyId: string;
  canonicalItemId: string;
  amountCents: number;
  ceilingCents: number;
  addressId: string;
  expiresAtUtc: string;
  createdAt: string;
};

export type CreateStubQuoteInput = {
  householdId: string;
  mandateId: string;
  agentKeyId: string;
  canonicalItemId: string;
  amountCents: number;
  ceilingCents: number;
  addressId: string;
  /** Expiry window ms from now (spec: under 10 minutes). */
  ttlMs?: number;
  nowUtc?: string;
};

export class MemoryStubQuoteRepository {
  private readonly rows: StubQuoteRow[] = [];

  create(input: CreateStubQuoteInput): StubQuoteRow {
    const now = input.nowUtc ?? new Date().toISOString();
    const ttl = input.ttlMs ?? 9 * 60 * 1000;
    const expiresAtUtc = new Date(Date.parse(now) + ttl).toISOString();
    const row: StubQuoteRow = {
      quoteId: ulid(),
      householdId: input.householdId,
      mandateId: input.mandateId,
      agentKeyId: input.agentKeyId,
      canonicalItemId: input.canonicalItemId,
      amountCents: input.amountCents,
      ceilingCents: input.ceilingCents,
      addressId: input.addressId,
      expiresAtUtc,
      createdAt: now,
    };
    this.rows.push(row);
    return row;
  }

  get(quoteId: string): StubQuoteRow | null {
    return this.rows.find((r) => r.quoteId === quoteId) ?? null;
  }
}
