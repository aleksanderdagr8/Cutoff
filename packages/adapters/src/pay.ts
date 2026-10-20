/**
 * Pay adapter boundary. Commit talks only to PayAdapter — never to a
 * payment SDK directly. Amount is the quote; callers never raise it.
 * Idempotency keys are the order id (authorize) and `${orderId}:capture`.
 *
 * `captureMode: "manual"` authorizes in `charge` and captures later.
 * The fake adapter omits it and captures immediately.
 */

export type ChargeInput = {
  orderId: string;
  amountCents: number;
  idempotencyKey: string;
  /** Present on the evidenced commit path so off-session pay can find the household. */
  householdId?: string;
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

export type CaptureAuthorizedInput = {
  orderId: string;
  authorizationId: string;
  amountCents: number;
  /** Distinct from the authorize key so a retry is not a replay of authorize. */
  idempotencyKey: string;
};

export type VoidAuthorizationInput = {
  orderId: string;
  authorizationId: string;
  idempotencyKey: string;
};

export type RefundPaymentInput = {
  orderId: string;
  paymentIntentId: string;
  amountCents: number;
  idempotencyKey: string;
};

/** $5/mo household plan. Separate from per-order authorize/capture. */
export const HOUSEHOLD_PLAN_AMOUNT_CENTS = 500;

export type HouseholdPlanInput = {
  householdId: string;
  email: string;
};

export type HouseholdPlanSession = {
  customerId: string;
  sessionId: string;
  url: string;
};

/**
 * Normalized, signature-verified payment event.
 * Order linkage prefers the PaymentIntent id stored on the order.
 * `orderId` is only the metadata fallback when that row is not written yet.
 */
export type PayWebhookEvent =
  | {
      type: "payment_succeeded";
      paymentIntentId: string;
      orderId: string | null;
      amountCents: number;
    }
  | {
      type: "payment_failed";
      paymentIntentId: string;
      orderId: string | null;
    }
  | {
      type: "payment_canceled";
      paymentIntentId: string;
      orderId: string | null;
    }
  | {
      type: "refunded";
      paymentIntentId: string | null;
      orderId: string | null;
      amountCents: number;
    }
  | {
      type: "plan_checkout_completed";
      householdId: string | null;
      customerId: string | null;
    }
  | {
      type: "plan_subscription";
      customerId: string | null;
      status: string;
    }
  | {
      type: "plan_invoice";
      customerId: string | null;
      paid: boolean;
    }
  | {
      type: "risk_signal";
      eventType: string;
      paymentIntentId: string | null;
    }
  | { type: "ignored"; eventType: string };

export class PayWebhookSignatureError extends Error {
  constructor() {
    super("invalid_stripe_signature");
    this.name = "PayWebhookSignatureError";
  }
}

export interface PayAdapter {
  /**
   * Omitted or `"immediate"`: `charge` captures funds.
   * `"manual"`: `charge` only authorizes; caller captures after placement.
   */
  readonly captureMode?: "immediate" | "manual";
  /**
   * Immediate capture, or authorize when `captureMode` is `manual`.
   * Implementations must dedupe by idempotencyKey.
   * Amount must equal the quote — callers never raise it after quote.
   */
  charge(input: ChargeInput): Promise<ChargeResult>;
  /** Capture a manual authorization. No-op for the immediate fake. */
  captureAuthorized?(input: CaptureAuthorizedInput): Promise<ChargeResult>;
  /** Release an uncaptured authorization so funds are not held. */
  voidAuthorization?(input: VoidAuthorizationInput): Promise<void>;
  /** Refund a captured PaymentIntent. Does not create a Cutoff balance. */
  refundPayment?(input: RefundPaymentInput): Promise<{ refundId: string }>;
  /** Checkout for the household plan. Not a per-order charge. */
  startHouseholdPlan?(
    input: HouseholdPlanInput,
  ): Promise<HouseholdPlanSession>;
  /**
   * Verify the webhook signature and normalize the event.
   * Throws PayWebhookSignatureError when the signature does not match.
   */
  verifyWebhook?(
    rawBody: string,
    signature: string | undefined,
  ): PayWebhookEvent;
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
