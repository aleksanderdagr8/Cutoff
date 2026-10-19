/**
 * Offer feed adapter boundary.
 * Aggregator (or fixture) normalizes into offers with fresh_until (Unit 5).
 */

export type RawOfferFeedRow = {
  /** External SKU / line id from the fulfiller feed. */
  externalSku: string;
  gtin: string;
  packCount: number;
  priceCents: number;
  taxCents: number;
  deliveryDateUtc: string;
  freshUntilUtc: string;
  inStock: boolean;
  fulfillerId: string;
  merchantScore?: number;
};

export type OfferFeedResult =
  | { ok: true; rows: RawOfferFeedRow[]; sourceId: string }
  | { ok: false; error: "fulfiller_down"; sourceId: string };

export interface OfferFeedAdapter {
  fetchOffers(): Promise<OfferFeedResult>;
}

export type FakeOfferSeed = RawOfferFeedRow;

/**
 * Fake aggregator feed used in CI. Can be forced down without wiping
 * previously ingested offers (that persistence lives in the offer repo).
 */
export class FakeAggregatorOfferAdapter implements OfferFeedAdapter {
  readonly sourceId: string;
  private down = false;
  private rows: RawOfferFeedRow[];

  constructor(
    rows: FakeOfferSeed[] = [],
    opts: { sourceId?: string } = {},
  ) {
    this.rows = rows.map((r) => ({ ...r }));
    this.sourceId = opts.sourceId ?? "aggregator_fixture";
  }

  setRows(rows: FakeOfferSeed[]): void {
    this.rows = rows.map((r) => ({ ...r }));
  }

  markDown(): void {
    this.down = true;
  }

  markUp(): void {
    this.down = false;
  }

  async fetchOffers(): Promise<OfferFeedResult> {
    if (this.down) {
      return { ok: false, error: "fulfiller_down", sourceId: this.sourceId };
    }
    return {
      ok: true,
      sourceId: this.sourceId,
      rows: this.rows.map((r) => ({ ...r })),
    };
  }
}

/**
 * Canonical item ids the brand-feed second source covers (top SKUs only).
 * Phase 6: second adapter on the fixture set top items — not the full catalog.
 */
export const BRAND_FEED_TOP_ITEM_IDS = [
  "item_towels_12",
  "item_coffee_12oz",
] as const;

export type BrandFeedTopItemId = (typeof BRAND_FEED_TOP_ITEM_IDS)[number];

/**
 * Fake brand-feed offer adapter (second live source). CI-safe; no network.
 * Only returns rows whose external mapping is for top items (caller seeds).
 */
export class FakeBrandFeedOfferAdapter implements OfferFeedAdapter {
  readonly sourceId: string;
  private down = false;
  private rows: RawOfferFeedRow[];
  private readonly allowedGtins: ReadonlySet<string> | null;

  constructor(
    rows: FakeOfferSeed[] = [],
    opts: {
      sourceId?: string;
      /** When set, only these GTINs are emitted (top-item gate). */
      allowedGtins?: readonly string[];
    } = {},
  ) {
    this.rows = rows.map((r) => ({ ...r }));
    this.sourceId = opts.sourceId ?? "brand_feed_fixture";
    this.allowedGtins = opts.allowedGtins
      ? new Set(opts.allowedGtins)
      : null;
  }

  setRows(rows: FakeOfferSeed[]): void {
    this.rows = rows.map((r) => ({ ...r }));
  }

  markDown(): void {
    this.down = true;
  }

  markUp(): void {
    this.down = false;
  }

  async fetchOffers(): Promise<OfferFeedResult> {
    if (this.down) {
      return { ok: false, error: "fulfiller_down", sourceId: this.sourceId };
    }
    const rows = this.rows
      .filter((r) =>
        this.allowedGtins ? this.allowedGtins.has(r.gtin) : true,
      )
      .map((r) => ({ ...r }));
    return { ok: true, sourceId: this.sourceId, rows };
  }
}
