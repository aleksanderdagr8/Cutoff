/**
 * Fulfill adapter boundary. Aggregator / brand / 3PL implement this.
 * Commit does not import fulfill adapters directly (framework rule).
 */

export type PlaceInput = {
  orderId: string;
  canonicalItemId: string;
  qty: number;
  fulfillerId?: string;
};

export type PlaceResult = {
  jobId: string;
  status: "accepted";
};

export type CancelFulfillInput = {
  jobId: string;
  orderId: string;
};

export type CancelFulfillResult = {
  ok: true;
  status: "cancelled";
};

export type TrackInput = {
  jobId: string;
};

export type TrackResult = {
  jobId: string;
  trackingNumber: string | null;
  status: "accepted" | "shipped" | "delivered" | "cancelled";
};

export interface FulfillAdapter {
  place(input: PlaceInput): Promise<PlaceResult>;
  cancel(input: CancelFulfillInput): Promise<CancelFulfillResult>;
  track(input: TrackInput): Promise<TrackResult>;
}

/** Fake used in CI / Units 0–9. No network. */
export class FakeFulfillAdapter implements FulfillAdapter {
  readonly jobs: PlaceResult[] = [];
  readonly cancels: CancelFulfillInput[] = [];
  readonly tracks: TrackInput[] = [];
  /** When true, next place call throws. */
  failNextPlace = false;
  private seq = 0;
  private readonly byOrder = new Map<string, PlaceResult>();
  private readonly byJob = new Map<
    string,
    { orderId: string; status: TrackResult["status"]; trackingNumber: string | null }
  >();

  async place(input: PlaceInput): Promise<PlaceResult> {
    const prior = this.byOrder.get(input.orderId);
    if (prior) return prior;
    if (this.failNextPlace) {
      this.failNextPlace = false;
      throw new Error("fulfill_adapter_error");
    }
    this.seq += 1;
    const result: PlaceResult = {
      jobId: `ff_fake_${this.seq}`,
      status: "accepted",
    };
    this.byOrder.set(input.orderId, result);
    this.byJob.set(result.jobId, {
      orderId: input.orderId,
      status: "accepted",
      trackingNumber: null,
    });
    this.jobs.push(result);
    return result;
  }

  async cancel(input: CancelFulfillInput): Promise<CancelFulfillResult> {
    this.cancels.push(input);
    const row = this.byJob.get(input.jobId);
    if (row) {
      row.status = "cancelled";
    }
    return { ok: true, status: "cancelled" };
  }

  async track(input: TrackInput): Promise<TrackResult> {
    this.tracks.push(input);
    const row = this.byJob.get(input.jobId);
    return {
      jobId: input.jobId,
      trackingNumber: row?.trackingNumber ?? null,
      status: row?.status ?? "accepted",
    };
  }

  /** Test helper: mark a job shipped with a tracking number. */
  markShipped(jobId: string, trackingNumber: string): void {
    const row = this.byJob.get(jobId);
    if (row) {
      row.status = "shipped";
      row.trackingNumber = trackingNumber;
    }
  }
}

/**
 * Aggregator sandbox stub for Unit 9. Same contract as FakeFulfillAdapter;
 * no network in CI. Swap to real aggregator SDK behind this class in sandbox.
 */
export class AggregatorFulfillAdapter implements FulfillAdapter {
  private readonly inner = new FakeFulfillAdapter();

  get jobs(): readonly PlaceResult[] {
    return this.inner.jobs;
  }

  set failNextPlace(v: boolean) {
    this.inner.failNextPlace = v;
  }

  async place(input: PlaceInput): Promise<PlaceResult> {
    return this.inner.place(input);
  }

  async cancel(input: CancelFulfillInput): Promise<CancelFulfillResult> {
    return this.inner.cancel(input);
  }

  async track(input: TrackInput): Promise<TrackResult> {
    return this.inner.track(input);
  }

  markShipped(jobId: string, trackingNumber: string): void {
    this.inner.markShipped(jobId, trackingNumber);
  }
}
