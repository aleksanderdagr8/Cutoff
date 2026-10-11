/**
 * Fulfill adapter boundary. Aggregator / brand / 3PL implement this later.
 * Commit does not import fulfill adapters directly (framework rule).
 */

export type PlaceInput = {
  orderId: string;
  canonicalItemId: string;
  qty: number;
};

export type PlaceResult = {
  jobId: string;
  status: "accepted";
};

export interface FulfillAdapter {
  place(input: PlaceInput): Promise<PlaceResult>;
}

/** Fake used in CI / Unit 0. No network. */
export class FakeFulfillAdapter implements FulfillAdapter {
  readonly jobs: PlaceResult[] = [];

  async place(input: PlaceInput): Promise<PlaceResult> {
    const result: PlaceResult = {
      jobId: `ff_fake_${this.jobs.length + 1}`,
      status: "accepted",
    };
    void input;
    this.jobs.push(result);
    return result;
  }
}
