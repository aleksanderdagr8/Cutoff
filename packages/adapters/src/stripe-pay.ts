import Stripe from "stripe";
import {
  HOUSEHOLD_PLAN_AMOUNT_CENTS,
  PayWebhookSignatureError,
  type ChargeInput,
  type ChargeResult,
  type CaptureAuthorizedInput,
  type HouseholdPlanInput,
  type HouseholdPlanSession,
  type PayAdapter,
  type PayWebhookEvent,
  type RefundPaymentInput,
  type VoidAuthorizationInput,
} from "./pay.js";

/**
 * Narrow Stripe surface. Tests pass a fake. The real client is wrapped in
 * `createStripePayAdapter` so handlers never import the SDK.
 */
export interface StripeGateway {
  createPaymentIntent(
    params: AuthorizeParams,
    idempotencyKey: string,
  ): Promise<{ id: string; amount: number }>;
  capturePaymentIntent(
    id: string,
    params: { amount_to_capture: number },
    idempotencyKey: string,
  ): Promise<{ id: string; amount_received: number }>;
  cancelPaymentIntent(id: string, idempotencyKey: string): Promise<void>;
  createRefund(
    params: { payment_intent: string; amount: number },
    idempotencyKey: string,
  ): Promise<{ id: string }>;
  retrieveCustomer(id: string): Promise<CustomerSnapshot | { deleted: true }>;
  createCustomer(
    params: { email: string },
    idempotencyKey: string,
  ): Promise<{ id: string }>;
  listActiveSubscriptionPaymentMethod(
    customerId: string,
  ): Promise<string | null>;
  retrievePrice(priceId: string): Promise<PriceSnapshot>;
  createCheckoutSession(
    params: PlanCheckoutParams,
    idempotencyKey: string,
  ): Promise<{ id: string; url: string | null }>;
  constructEvent(
    payload: string,
    header: string,
    secret: string,
  ): { id: string; type: string; data: { object: unknown } };
}

export type AuthorizeParams = {
  amount: number;
  currency: "usd";
  capture_method: "manual";
  confirm: true;
  off_session: true;
  customer: string;
  payment_method: string;
  description: string;
  metadata: { order_id: string };
};

export type PlanCheckoutParams = {
  mode: "subscription";
  customer: string;
  client_reference_id: string;
  line_items: [{ price: string; quantity: 1 }];
  success_url: string;
  cancel_url: string;
  integration_identifier: string;
};

export type CustomerSnapshot = {
  deleted?: false;
  invoice_settings?: {
    default_payment_method?: string | { id: string } | null;
  };
};

export type PriceSnapshot = {
  unit_amount: number | null;
  currency: string;
  recurring: { interval: string } | null;
};

export type StripePayOptions = {
  webhookSecret: string;
  priceId?: string;
  successUrl: string;
  cancelUrl: string;
  lookupCustomerId: (householdId: string) => Promise<string | null>;
};

function payError(): Error {
  return new Error("pay_adapter_error");
}

function paymentMethodId(
  value: string | { id: string } | null | undefined,
): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (value && typeof value === "object" && value.id) return value.id;
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function stringField(
  obj: Record<string, unknown>,
  key: string,
): string | null {
  const value = obj[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberField(obj: Record<string, unknown>, key: string): number {
  const value = obj[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function metadataOrderId(obj: Record<string, unknown>): string | null {
  const metadata = asRecord(obj.metadata);
  if (!metadata) return null;
  return stringField(metadata, "order_id");
}

function idOf(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  const record = asRecord(value);
  if (!record) return null;
  return stringField(record, "id");
}

/** Eight letters, for Checkout `integration_identifier`. */
export function randomIntegrationSuffix(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let suffix = "";
  for (const byte of bytes) {
    suffix += alphabet[byte % alphabet.length];
  }
  return suffix;
}

function normalizeEvent(event: {
  type: string;
  data: { object: unknown };
}): PayWebhookEvent {
  const object = asRecord(event.data.object) ?? {};
  switch (event.type) {
    case "payment_intent.succeeded":
      return {
        type: "payment_succeeded",
        paymentIntentId: stringField(object, "id") ?? "",
        orderId: metadataOrderId(object),
        amountCents: numberField(object, "amount_received") || numberField(object, "amount"),
      };
    case "payment_intent.payment_failed":
      return {
        type: "payment_failed",
        paymentIntentId: stringField(object, "id") ?? "",
        orderId: metadataOrderId(object),
      };
    case "payment_intent.canceled":
      return {
        type: "payment_canceled",
        paymentIntentId: stringField(object, "id") ?? "",
        orderId: metadataOrderId(object),
      };
    case "charge.refunded":
      return {
        type: "refunded",
        paymentIntentId: idOf(object.payment_intent),
        orderId: metadataOrderId(object),
        amountCents: numberField(object, "amount_refunded"),
      };
    case "checkout.session.completed": {
      if (object.mode !== "subscription") {
        return { type: "ignored", eventType: event.type };
      }
      return {
        type: "plan_checkout_completed",
        householdId: stringField(object, "client_reference_id"),
        customerId: idOf(object.customer),
      };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return {
        type: "plan_subscription",
        customerId: idOf(object.customer),
        status: stringField(object, "status") ?? "",
      };
    case "invoice.paid":
      return {
        type: "plan_invoice",
        customerId: idOf(object.customer),
        paid: true,
      };
    case "invoice.payment_failed":
      return {
        type: "plan_invoice",
        customerId: idOf(object.customer),
        paid: false,
      };
    case "charge.dispute.created":
    case "radar.early_fraud_warning.created":
      return {
        type: "risk_signal",
        eventType: event.type,
        paymentIntentId: idOf(object.payment_intent),
      };
    default:
      return { type: "ignored", eventType: event.type };
  }
}

/**
 * Test-mode Stripe Billing + PaymentIntents.
 * Per-order: manual capture (authorize, then capture). No wallet, no balance.
 * Household plan: a separate Checkout subscription. Price must be $5/mo.
 */
export class StripePayAdapter implements PayAdapter {
  readonly captureMode = "manual" as const;

  constructor(
    private readonly gateway: StripeGateway,
    private readonly options: StripePayOptions,
  ) {}

  async charge(input: ChargeInput): Promise<ChargeResult> {
    if (!input.householdId || !input.idempotencyKey) throw payError();
    if (!Number.isInteger(input.amountCents) || input.amountCents < 0) {
      throw payError();
    }
    try {
      const customerId = await this.options.lookupCustomerId(input.householdId);
      if (!customerId) throw payError();
      const method = await this.defaultPaymentMethod(customerId);
      if (!method) throw payError();
      const params: AuthorizeParams = {
        amount: input.amountCents,
        currency: "usd",
        capture_method: "manual",
        confirm: true,
        off_session: true,
        customer: customerId,
        payment_method: method,
        description: `Cutoff order ${input.orderId}`,
        metadata: { order_id: input.orderId },
      };
      const intent = await this.gateway.createPaymentIntent(
        params,
        input.idempotencyKey,
      );
      return { chargeId: intent.id, amountCents: input.amountCents };
    } catch (error) {
      if (error instanceof Error && error.message === "pay_adapter_error") {
        throw error;
      }
      throw payError();
    }
  }

  async captureAuthorized(input: CaptureAuthorizedInput): Promise<ChargeResult> {
    if (!Number.isInteger(input.amountCents) || input.amountCents < 0) {
      throw payError();
    }
    try {
      const captured = await this.gateway.capturePaymentIntent(
        input.authorizationId,
        { amount_to_capture: input.amountCents },
        input.idempotencyKey,
      );
      return {
        chargeId: captured.id,
        amountCents: input.amountCents,
      };
    } catch {
      throw payError();
    }
  }

  async voidAuthorization(input: VoidAuthorizationInput): Promise<void> {
    try {
      await this.gateway.cancelPaymentIntent(
        input.authorizationId,
        input.idempotencyKey,
      );
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: unknown }).code)
          : "";
      if (code === "payment_intent_unexpected_state") return;
      throw payError();
    }
  }

  async refundPayment(
    input: RefundPaymentInput,
  ): Promise<{ refundId: string }> {
    try {
      const refund = await this.gateway.createRefund(
        { payment_intent: input.paymentIntentId, amount: input.amountCents },
        input.idempotencyKey,
      );
      return { refundId: refund.id };
    } catch {
      throw payError();
    }
  }

  async startHouseholdPlan(
    input: HouseholdPlanInput,
  ): Promise<HouseholdPlanSession> {
    const priceId = this.options.priceId;
    if (!priceId) throw payError();
    try {
      const price = await this.gateway.retrievePrice(priceId);
      if (
        price.unit_amount !== HOUSEHOLD_PLAN_AMOUNT_CENTS ||
        price.currency !== "usd" ||
        price.recurring?.interval !== "month"
      ) {
        throw payError();
      }
      let customerId = await this.options.lookupCustomerId(input.householdId);
      if (!customerId) {
        const created = await this.gateway.createCustomer(
          { email: input.email },
          `customer:${input.householdId}`,
        );
        customerId = created.id;
      }
      const session = await this.gateway.createCheckoutSession(
        {
          mode: "subscription",
          customer: customerId,
          client_reference_id: input.householdId,
          line_items: [{ price: priceId, quantity: 1 }],
          success_url: this.options.successUrl,
          cancel_url: this.options.cancelUrl,
          integration_identifier: `cutoff_plan_${randomIntegrationSuffix()}`,
        },
        `plan:${input.householdId}`,
      );
      if (!session.url) throw payError();
      return {
        customerId,
        sessionId: session.id,
        url: session.url,
      };
    } catch (error) {
      if (error instanceof Error && error.message === "pay_adapter_error") {
        throw error;
      }
      throw payError();
    }
  }

  verifyWebhook(
    rawBody: string,
    signature: string | undefined,
  ): PayWebhookEvent {
    if (!this.options.webhookSecret || !signature) {
      throw new PayWebhookSignatureError();
    }
    try {
      const event = this.gateway.constructEvent(
        rawBody,
        signature,
        this.options.webhookSecret,
      );
      const normalized = normalizeEvent(event);
      if (
        (normalized.type === "payment_succeeded" ||
          normalized.type === "payment_failed" ||
          normalized.type === "payment_canceled") &&
        !normalized.paymentIntentId
      ) {
        throw new PayWebhookSignatureError();
      }
      return normalized;
    } catch (error) {
      if (error instanceof PayWebhookSignatureError) throw error;
      throw new PayWebhookSignatureError();
    }
  }

  private async defaultPaymentMethod(customerId: string): Promise<string | null> {
    const customer = await this.gateway.retrieveCustomer(customerId);
    if ("deleted" in customer && customer.deleted) return null;
    const fromCustomer = paymentMethodId(
      customer.invoice_settings?.default_payment_method,
    );
    if (fromCustomer) return fromCustomer;
    return this.gateway.listActiveSubscriptionPaymentMethod(customerId);
  }
}

export function createStripePayAdapter(input: {
  secretKey: string;
  webhookSecret: string;
  priceId?: string;
  appUrl?: string;
  lookupCustomerId: (householdId: string) => Promise<string | null>;
}): StripePayAdapter {
  const stripe = new Stripe(input.secretKey, {
    apiVersion: "2026-09-30.endive",
    httpClient: Stripe.createFetchHttpClient(),
  });
  const appUrl = (input.appUrl ?? "https://callcutoff.com").replace(/\/$/, "");
  return new StripePayAdapter(gatewayFromStripe(stripe), {
    webhookSecret: input.webhookSecret,
    priceId: input.priceId,
    successUrl: `${appUrl}/home/plan/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl}/home/plan/cancel`,
    lookupCustomerId: input.lookupCustomerId,
  });
}

function gatewayFromStripe(stripe: Stripe): StripeGateway {
  return {
    createPaymentIntent: (params, idempotencyKey) =>
      stripe.paymentIntents.create(params, { idempotencyKey }),
    capturePaymentIntent: (id, params, idempotencyKey) =>
      stripe.paymentIntents.capture(id, params, { idempotencyKey }),
    cancelPaymentIntent: async (id, idempotencyKey) => {
      await stripe.paymentIntents.cancel(id, {}, { idempotencyKey });
    },
    createRefund: (params, idempotencyKey) =>
      stripe.refunds.create(params, { idempotencyKey }),
    retrieveCustomer: async (id) => {
      const customer = await stripe.customers.retrieve(id);
      if (customer.deleted) return { deleted: true };
      return {
        invoice_settings: {
          default_payment_method: customer.invoice_settings?.default_payment_method,
        },
      };
    },
    createCustomer: (params, idempotencyKey) =>
      stripe.customers.create(params, { idempotencyKey }),
    listActiveSubscriptionPaymentMethod: async (customerId) => {
      const list = await stripe.subscriptions.list({
        customer: customerId,
        status: "active",
        limit: 1,
      });
      const method = list.data[0]?.default_payment_method;
      return paymentMethodId(method);
    },
    retrievePrice: async (priceId) => {
      const price = await stripe.prices.retrieve(priceId);
      return {
        unit_amount: price.unit_amount,
        currency: price.currency,
        recurring: price.recurring
          ? { interval: price.recurring.interval }
          : null,
      };
    },
    createCheckoutSession: (params, idempotencyKey) =>
      stripe.checkout.sessions.create(params, { idempotencyKey }),
    constructEvent: (payload, header, secret) =>
      stripe.webhooks.constructEvent(payload, header, secret),
  };
}
