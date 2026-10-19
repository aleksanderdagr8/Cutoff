/**
 * Receipt tokens for the household console (Unit 10).
 * Human opens a link; agent credential is not required.
 */

import { ulid } from "./ulid.js";

export type ReceiptRow = {
  receiptToken: string;
  orderId: string;
  householdId: string;
  createdAt: string;
};

export class MemoryReceiptRepository {
  private readonly rows: ReceiptRow[] = [];
  private readonly byOrder = new Map<string, ReceiptRow>();

  issue(input: {
    orderId: string;
    householdId: string;
    nowUtc: string;
  }): ReceiptRow {
    const existing = this.byOrder.get(input.orderId);
    if (existing) return existing;

    const row: ReceiptRow = {
      receiptToken: `rcpt_${ulid()}`,
      orderId: input.orderId,
      householdId: input.householdId,
      createdAt: input.nowUtc,
    };
    this.rows.push(row);
    this.byOrder.set(input.orderId, row);
    return row;
  }

  getByToken(token: string): ReceiptRow | null {
    return this.rows.find((r) => r.receiptToken === token) ?? null;
  }

  getByOrder(orderId: string): ReceiptRow | null {
    return this.byOrder.get(orderId) ?? null;
  }
}
