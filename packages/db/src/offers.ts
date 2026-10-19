/**
 * Offer module repository. Owns `offers` only.
 * Unit 5: freshness, dual fulfillers, adapter failure preserves last good.
 */

import type { OfferFeedAdapter, RawOfferFeedRow } from "@cutoff/adapters";
import type { MemoryCatalogRepository } from "./catalog.js";
import { ulid } from "./ulid.js";

export type OfferRow = {
  offerId: string;
  canonicalItemId: string;
  fulfillerId: string;
  sourceId: string;
  externalSku: string;
  priceCents: number;
  taxCents: number;
  deliveryDateUtc: string;
  freshUntilUtc: string;
  inStock: boolean;
  merchantScore: number;
  updatedAt: string;
};

export type OfferSourceState = {
  sourceId: string;
  down: boolean;
  lastErrorAt: string | null;
};

export class MemoryOfferRepository {
  private readonly offers = new Map<string, OfferRow>();
  private readonly sources = new Map<string, OfferSourceState>();

  private key(fulfillerId: string, canonicalItemId: string): string {
    return `${fulfillerId}::${canonicalItemId}`;
  }

  upsertNormalized(
    input: Omit<OfferRow, "offerId" | "updatedAt"> & { offerId?: string },
  ): OfferRow {
    const k = this.key(input.fulfillerId, input.canonicalItemId);
    const existing = this.offers.get(k);
    const row: OfferRow = {
      offerId: existing?.offerId ?? input.offerId ?? ulid(),
      canonicalItemId: input.canonicalItemId,
      fulfillerId: input.fulfillerId,
      sourceId: input.sourceId,
      externalSku: input.externalSku,
      priceCents: input.priceCents,
      taxCents: input.taxCents,
      deliveryDateUtc: input.deliveryDateUtc,
      freshUntilUtc: input.freshUntilUtc,
      inStock: input.inStock,
      merchantScore: input.merchantScore,
      updatedAt: new Date().toISOString(),
    };
    this.offers.set(k, row);
    this.sources.set(input.sourceId, {
      sourceId: input.sourceId,
      down: false,
      lastErrorAt: null,
    });
    return row;
  }

  markSourceDown(sourceId: string, atUtc: string): OfferSourceState {
    const state: OfferSourceState = {
      sourceId,
      down: true,
      lastErrorAt: atUtc,
    };
    this.sources.set(sourceId, state);
    return state;
  }

  sourceState(sourceId: string): OfferSourceState | null {
    return this.sources.get(sourceId) ?? null;
  }

  listForItem(canonicalItemId: string): OfferRow[] {
    return [...this.offers.values()].filter(
      (o) => o.canonicalItemId === canonicalItemId,
    );
  }

  listAll(): readonly OfferRow[] {
    return [...this.offers.values()];
  }

  /**
   * Pull from adapter. On failure: mark source down, do not delete last good.
   */
  async ingestFromAdapter(
    adapter: OfferFeedAdapter,
    catalog: MemoryCatalogRepository,
    nowUtc: string,
  ): Promise<
    | { ok: true; upserted: number }
    | { ok: false; error: "fulfiller_down"; preserved: number }
  > {
    const result = await adapter.fetchOffers();
    if (!result.ok) {
      this.markSourceDown(result.sourceId, nowUtc);
      const preserved = [...this.offers.values()].filter(
        (o) => o.sourceId === result.sourceId,
      ).length;
      return { ok: false, error: "fulfiller_down", preserved };
    }

    let upserted = 0;
    for (const raw of result.rows) {
      const item = catalog.findByGtinPack(raw.gtin, raw.packCount);
      if (!item) continue;
      this.upsertNormalized({
        canonicalItemId: item.canonicalItemId,
        fulfillerId: raw.fulfillerId,
        sourceId: result.sourceId,
        externalSku: raw.externalSku,
        priceCents: raw.priceCents,
        taxCents: raw.taxCents,
        deliveryDateUtc: raw.deliveryDateUtc,
        freshUntilUtc: raw.freshUntilUtc,
        inStock: raw.inStock,
        merchantScore: raw.merchantScore ?? 0,
      });
      upserted += 1;
    }
    return { ok: true, upserted };
  }
}

/** Dual-fulfiller fixture offers for the replenishment set. */
export function seedDualFulfillerOffers(
  offers: MemoryOfferRepository,
  opts: {
    nowUtc?: string;
    /** Override towels_12 prices for ceiling tests. */
    towels12Prices?: { a: number; b: number };
  } = {},
): MemoryOfferRepository {
  const now = opts.nowUtc ?? "2026-10-19T12:00:00.000Z";
  const freshUntil = new Date(Date.parse(now) + 24 * 60 * 60 * 1000).toISOString();
  const delivery = "2026-10-21";
  const towelsA = opts.towels12Prices?.a ?? 1299;
  const towelsB = opts.towels12Prices?.b ?? 1499;

  const rows: Array<{
    canonicalItemId: string;
    fulfillerId: string;
    priceCents: number;
    externalSku: string;
  }> = [
    {
      canonicalItemId: "item_towels_12",
      fulfillerId: "fulfiller_a",
      priceCents: towelsA,
      externalSku: "A-TOWEL-12",
    },
    {
      canonicalItemId: "item_towels_12",
      fulfillerId: "fulfiller_b",
      priceCents: towelsB,
      externalSku: "B-TOWEL-12",
    },
    {
      canonicalItemId: "item_towels_6",
      fulfillerId: "fulfiller_a",
      priceCents: 799,
      externalSku: "A-TOWEL-6",
    },
    {
      canonicalItemId: "item_towels_6",
      fulfillerId: "fulfiller_b",
      priceCents: 849,
      externalSku: "B-TOWEL-6",
    },
    {
      canonicalItemId: "item_coffee_12oz",
      fulfillerId: "fulfiller_a",
      priceCents: 999,
      externalSku: "A-COFFEE-12",
    },
    {
      canonicalItemId: "item_coffee_24oz",
      fulfillerId: "fulfiller_a",
      priceCents: 1799,
      externalSku: "A-COFFEE-24",
    },
    {
      canonicalItemId: "item_filter_1",
      fulfillerId: "fulfiller_a",
      priceCents: 1599,
      externalSku: "A-FILTER-1",
    },
    {
      canonicalItemId: "item_filter_2",
      fulfillerId: "fulfiller_a",
      priceCents: 2899,
      externalSku: "A-FILTER-2",
    },
    {
      canonicalItemId: "item_kibble_5lb",
      fulfillerId: "fulfiller_a",
      priceCents: 2199,
      externalSku: "A-KIBBLE-5",
    },
    {
      canonicalItemId: "item_kibble_15lb",
      fulfillerId: "fulfiller_a",
      priceCents: 4999,
      externalSku: "A-KIBBLE-15",
    },
  ];

  for (const r of rows) {
    offers.upsertNormalized({
      canonicalItemId: r.canonicalItemId,
      fulfillerId: r.fulfillerId,
      sourceId: "aggregator_fixture",
      externalSku: r.externalSku,
      priceCents: r.priceCents,
      taxCents: 0,
      deliveryDateUtc: delivery,
      freshUntilUtc: freshUntil,
      inStock: true,
      merchantScore: 0,
    });
  }
  return offers;
}

export function rawFeedFromOffers(
  catalog: MemoryCatalogRepository,
  offerRows: OfferRow[],
): RawOfferFeedRow[] {
  return offerRows.map((o) => {
    const item = catalog.get(o.canonicalItemId);
    if (!item) {
      throw new Error(`missing_catalog:${o.canonicalItemId}`);
    }
    return {
      externalSku: o.externalSku,
      gtin: item.gtin,
      packCount: item.packCount,
      priceCents: o.priceCents,
      taxCents: o.taxCents,
      deliveryDateUtc: o.deliveryDateUtc,
      freshUntilUtc: o.freshUntilUtc,
      inStock: o.inStock,
      fulfillerId: o.fulfillerId,
      merchantScore: o.merchantScore,
    };
  });
}
