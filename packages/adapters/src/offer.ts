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
