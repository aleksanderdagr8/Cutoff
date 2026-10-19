/**
 * Mandate module repository. Agent cannot raise ceiling or add address —
 * those mutations are rejected at the domain/handler layer before write.
 */

import type { MandateSnapshot } from "@cutoff/domain";
import { applyLowerCeiling } from "@cutoff/domain";
import { ulid } from "./ulid.js";

export type MandateRow = {
  mandateId: string;
  householdId: string;
  ceilingCents: number;
  expiresAtUtc: string;
  canonicalItemIds: string[];
  categoryAllowList: string[];
  neverSubstituteIds: string[];
  addressId: string;
  actorCap: number;
  /** Agent may cancel-before-ship when true (Unit 9). */
  allowCancel: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateMandateInput = {
  householdId: string;
  ceilingCents: number;
  expiresAtUtc: string;
  canonicalItemIds: string[];
  categoryAllowList?: string[];
  neverSubstituteIds?: string[];
  addressId: string;
  actorCap?: number;
  allowCancel?: boolean;
};

export class MemoryMandateRepository {
  private readonly rows: MandateRow[] = [];

  create(input: CreateMandateInput): MandateRow {
    const now = new Date().toISOString();
    const row: MandateRow = {
      mandateId: ulid(),
      householdId: input.householdId,
      ceilingCents: input.ceilingCents,
      expiresAtUtc: input.expiresAtUtc,
      canonicalItemIds: [...input.canonicalItemIds],
      categoryAllowList: [...(input.categoryAllowList ?? [])],
      neverSubstituteIds: [...(input.neverSubstituteIds ?? [])],
      addressId: input.addressId,
      actorCap: input.actorCap ?? 4,
      allowCancel: input.allowCancel ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(row);
    return row;
  }

  get(mandateId: string): MandateRow | null {
    return this.rows.find((r) => r.mandateId === mandateId) ?? null;
  }

  getForHousehold(
    mandateId: string,
    householdId: string,
  ): MandateRow | null {
    const row = this.get(mandateId);
    if (!row || row.householdId !== householdId) return null;
    return row;
  }

  toSnapshot(row: MandateRow): MandateSnapshot {
    return {
      ceilingCents: row.ceilingCents,
      expiresAtUtc: row.expiresAtUtc,
      canonicalItemIds: row.canonicalItemIds,
      categoryAllowList: row.categoryAllowList,
      neverSubstituteIds: row.neverSubstituteIds,
      addressId: row.addressId,
      actorCap: row.actorCap,
    };
  }

  /**
   * Human path: lower ceiling only. Returns null if raise attempted.
   */
  lowerCeiling(
    mandateId: string,
    householdId: string,
    requestedCeilingCents: number,
  ): MandateRow | null {
    const row = this.getForHousehold(mandateId, householdId);
    if (!row) return null;
    const next = applyLowerCeiling(row.ceilingCents, requestedCeilingCents);
    if (next === null) return null;
    row.ceilingCents = next;
    row.updatedAt = new Date().toISOString();
    return row;
  }
}
