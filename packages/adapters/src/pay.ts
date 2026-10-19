/**
 * Pay adapter boundary. Live Stripe lives behind this interface later.
 * Commit talks only to PayAdapter — never to Stripe SDK directly.
 * Unit 8: amount capped to quote; idempotency key shared with the order.
 */

export type ChargeInput = {
  orderId: string;
  amountCents: number;
  idempotencyKey: string;
};

export type ChargeResult = {
  chargeId: string;
  amountCents: number;
};

export type ChargeFailure = {
  ok: false;
  error: "pay_adapter_error";
};

export type ChargeOutcome =
  | { ok: true; charge: ChargeResult }
  | ChargeFailure;

export interface PayAdapter {
  /**
   * Charge. Implementations must dedupe by idempotencyKey.
   * Amount must equal the quote — callers never raise it after quote.
   */
  charge(input: ChargeInput): Promise<ChargeResult>;
}

/** Fake used in CI / Units 0–8. No network. Dedupes by idempotency key. */
export class FakePayAdapter implements PayAdapter {
  readonly charges: ChargeResult[] = [];
  readonly attempts: ChargeInput[] = [];
  private readonly byKey = new Map<string, ChargeResult>();
  /** When true, next (and subsequent) charge calls throw. */
  failNext = false;
  private seq = 0;

  async charge(input: ChargeInput): Promise<ChargeResult> {
    this.attempts.push({ ...input });
    if (this.failNext) {
      throw new Error("pay_adapter_error");
    }
    const existing = this.byKey.get(input.idempotencyKey);
    if (existing) {
      return existing;
    }
    this.seq += 1;
    const result: ChargeResult = {
      chargeId: `ch_fake_${this.seq}`,
      amountCents: input.amountCents,
    };
    this.byKey.set(input.idempotencyKey, result);
    this.charges.push(result);
    return result;
  }
}

/**
 * Stripe sandbox stub for Unit 8 "live" mark. Same contract as FakePayAdapter;
 * no network in CI. Swap to real Stripe SDK behind this class in sandbox only.
 */
export class StripeSandboxPayAdapter implements PayAdapter {
  private readonly inner = new FakePayAdapter();

  get charges(): readonly ChargeResult[] {
    return this.inner.charges;
  }

  get attempts(): readonly ChargeInput[] {
    return this.inner.attempts;
  }

  set failNext(v: boolean) {
    this.inner.failNext = v;
  }

  async charge(input: ChargeInput): Promise<ChargeResult> {
    return this.inner.charge(input);
  }
}
