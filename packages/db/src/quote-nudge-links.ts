/**
 * Unit 15: quote_id → nudge_id link for reorder → commit.
 * In-process store (memory CI + Worker isolate). Durable column can wait.
 */

import type { MaybePromise } from "./types.js";

export interface QuoteNudgeLinkStore {
  set(quoteId: string, nudgeId: string): MaybePromise<void>;
  /** Returns and clears the link. */
  take(quoteId: string): MaybePromise<string | null>;
}

export class MemoryQuoteNudgeLinkStore implements QuoteNudgeLinkStore {
  private readonly links = new Map<string, string>();

  set(quoteId: string, nudgeId: string): void {
    this.links.set(quoteId, nudgeId);
  }

  take(quoteId: string): string | null {
    const nudgeId = this.links.get(quoteId) ?? null;
    if (nudgeId != null) this.links.delete(quoteId);
    return nudgeId;
  }
}
