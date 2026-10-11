/**
 * Pay adapter boundary. Live Stripe lives behind this interface later.
 * Commit talks only to PayAdapter — never to Stripe SDK directly.
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

export interface PayAdapter {
  charge(input: ChargeInput): Promise<ChargeResult>;
}

/** Fake used in CI / Unit 0. No network. Dedupes by idempotency key. */
export class FakePayAdapter implements PayAdapter {
  readonly charges: ChargeResult[] = [];
  private readonly byKey = new Map<string, ChargeResult>();

  async charge(input: ChargeInput): Promise<ChargeResult> {
    const existing = this.byKey.get(input.idempotencyKey);
    if (existing) {
      return existing;
    }
    const result: ChargeResult = {
      chargeId: `ch_fake_${this.charges.length + 1}`,
      amountCents: input.amountCents,
    };
    this.byKey.set(input.idempotencyKey, result);
    this.charges.push(result);
    return result;
  }
}
