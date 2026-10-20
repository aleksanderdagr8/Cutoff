import { describe, expect, it } from "vitest";
import { HOUSEHOLD_PLAN_AMOUNT_CENTS, PayWebhookSignatureError } from "./pay.js";
import {
  StripePayAdapter,
  type StripeGateway,
} from "./stripe-pay.js";

function gateway(overrides: Partial<StripeGateway> = {}): StripeGateway & {
  calls: Array<{ method: string; args: unknown[] }>;
} {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const base: StripeGateway = {
    createPaymentIntent: async (params, idempotencyKey) => {
      calls.push({ method: "createPaymentIntent", args: [params, idempotencyKey] });
      return { id: "pi_test_1", amount: params.amount };
    },
    capturePaymentIntent: async (id, params, idempotencyKey) => {
      calls.push({
        method: "capturePaymentIntent",
        args: [id, params, idempotencyKey],
      });
      return { id, amount_received: params.amount_to_capture };
    },
    cancelPaymentIntent: async (id, idempotencyKey) => {
      calls.push({ method: "cancelPaymentIntent", args: [id, idempotencyKey] });
    },
    createRefund: async (params, idempotencyKey) => {
      calls.push({ method: "createRefund", args: [params, idempotencyKey] });
      return { id: "re_test_1" };
    },
    retrieveCustomer: async (id) => {
      calls.push({ method: "retrieveCustomer", args: [id] });
      return { invoice_settings: { default_payment_method: "pm_test_1" } };
    },
    createCustomer: async (params, idempotencyKey) => {
      calls.push({ method: "createCustomer", args: [params, idempotencyKey] });
      return { id: "cus_test_1" };
    },
    listActiveSubscriptionPaymentMethod: async (customerId) => {
      calls.push({
        method: "listActiveSubscriptionPaymentMethod",
        args: [customerId],
      });
      return null;
    },
    retrievePrice: async (priceId) => {
      calls.push({ method: "retrievePrice", args: [priceId] });
      return {
        unit_amount: HOUSEHOLD_PLAN_AMOUNT_CENTS,
        currency: "usd",
        recurring: { interval: "month" },
      };
    },
    createCheckoutSession: async (params, idempotencyKey) => {
      calls.push({
        method: "createCheckoutSession",
        args: [params, idempotencyKey],
      });
      return {
        id: "cs_test_1",
        url: "https://checkout.stripe.com/c/pay/cs_test_1",
      };
    },
    constructEvent: (payload, header, secret) => {
      calls.push({ method: "constructEvent", args: [payload, header, secret] });
      return JSON.parse(payload) as {
        id: string;
        type: string;
        data: { object: unknown };
      };
    },
  };
  return { calls, ...base, ...overrides };
}

function adapter(
  gw: StripeGateway,
  opts?: { customerId?: string | null; priceId?: string },
) {
  return new StripePayAdapter(gw, {
    webhookSecret: "whsec_test",
    priceId: opts?.priceId ?? "price_test_5",
    successUrl: "https://callcutoff.com/home/plan/success?session_id={CHECKOUT_SESSION_ID}",
    cancelUrl: "https://callcutoff.com/home/plan/cancel",
    lookupCustomerId: async () =>
      opts && "customerId" in opts ? (opts.customerId ?? null) : "cus_test_1",
  });
}

describe("StripePayAdapter", () => {
  it("authorizes off-session with manual capture and the order idempotency key", async () => {
    const gw = gateway();
    const pay = adapter(gw);
    const result = await pay.charge({
      orderId: "ord_1",
      amountCents: 1200,
      idempotencyKey: "ord_1",
      householdId: "hh_1",
    });
    expect(result).toEqual({ chargeId: "pi_test_1", amountCents: 1200 });
    expect(pay.captureMode).toBe("manual");
    const call = gw.calls.find((entry) => entry.method === "createPaymentIntent");
    expect(call?.args[1]).toBe("ord_1");
    const params = call?.args[0] as Record<string, unknown>;
    expect(params).toMatchObject({
      amount: 1200,
      currency: "usd",
      capture_method: "manual",
      confirm: true,
      off_session: true,
      customer: "cus_test_1",
      payment_method: "pm_test_1",
      metadata: { order_id: "ord_1" },
    });
    expect(params).not.toHaveProperty("payment_method_types");
  });

  it("fails closed when the household has no saved payment method", async () => {
    const gw = gateway({
      retrieveCustomer: async () => ({ invoice_settings: {} }),
    });
    const pay = adapter(gw);
    await expect(
      pay.charge({
        orderId: "ord_1",
        amountCents: 500,
        idempotencyKey: "ord_1",
        householdId: "hh_1",
      }),
    ).rejects.toThrow("pay_adapter_error");
    expect(gw.calls.some((entry) => entry.method === "createPaymentIntent")).toBe(
      false,
    );
  });

  it("captures with a distinct idempotency key and voids on cancel", async () => {
    const gw = gateway();
    const pay = adapter(gw);
    await pay.captureAuthorized({
      orderId: "ord_1",
      authorizationId: "pi_test_1",
      amountCents: 1200,
      idempotencyKey: "ord_1:capture",
    });
    await pay.voidAuthorization({
      orderId: "ord_1",
      authorizationId: "pi_test_1",
      idempotencyKey: "ord_1:void",
    });
    await pay.refundPayment({
      orderId: "ord_1",
      paymentIntentId: "pi_test_1",
      amountCents: 1200,
      idempotencyKey: "ord_1:refund",
    });
    expect(gw.calls.find((c) => c.method === "capturePaymentIntent")?.args).toEqual([
      "pi_test_1",
      { amount_to_capture: 1200 },
      "ord_1:capture",
    ]);
    expect(gw.calls.find((c) => c.method === "cancelPaymentIntent")?.args[1]).toBe(
      "ord_1:void",
    );
    expect(gw.calls.find((c) => c.method === "createRefund")?.args[0]).toEqual({
      payment_intent: "pi_test_1",
      amount: 1200,
    });
  });

  it("opens a $5/mo subscription checkout separate from the order charge", async () => {
    const gw = gateway();
    const pay = adapter(gw, { customerId: null });
    const session = await pay.startHouseholdPlan({
      householdId: "hh_1",
      email: "a@example.com",
    });
    expect(session.customerId).toBe("cus_test_1");
    expect(session.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const checkout = gw.calls.find((c) => c.method === "createCheckoutSession");
    const params = checkout?.args[0] as Record<string, unknown>;
    expect(params.mode).toBe("subscription");
    expect(params.client_reference_id).toBe("hh_1");
    expect(params.line_items).toEqual([{ price: "price_test_5", quantity: 1 }]);
    expect(params).not.toHaveProperty("payment_method_types");
    expect(params).not.toHaveProperty("automatic_tax");
    expect(params.integration_identifier).toMatch(/^cutoff_plan_[a-z]{8}$/);
    expect(checkout?.args[1]).toBe("plan:hh_1");
    expect(gw.calls.find((c) => c.method === "createCustomer")?.args[1]).toBe(
      "customer:hh_1",
    );
  });

  it("rejects a price that is not $5/mo", async () => {
    const gw = gateway({
      retrievePrice: async () => ({
        unit_amount: 1000,
        currency: "usd",
        recurring: { interval: "month" },
      }),
    });
    const pay = adapter(gw);
    await expect(
      pay.startHouseholdPlan({ householdId: "hh_1", email: "a@example.com" }),
    ).rejects.toThrow("pay_adapter_error");
  });

  it("verifies the webhook signature before reading payment events", () => {
    const gw = gateway({
      constructEvent: (payload, _header, secret) => {
        if (secret !== "whsec_test") throw new Error("bad");
        return JSON.parse(payload);
      },
    });
    const pay = adapter(gw);
    expect(() => pay.verifyWebhook("{}", undefined)).toThrow(
      PayWebhookSignatureError,
    );
    expect(() => pay.verifyWebhook("{}", "sig")).toThrow(PayWebhookSignatureError);

    const succeeded = pay.verifyWebhook(
      JSON.stringify({
        id: "evt_1",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_test_1",
            amount_received: 1200,
            metadata: { order_id: "ord_1" },
          },
        },
      }),
      "sig",
    );
    expect(succeeded).toEqual({
      type: "payment_succeeded",
      paymentIntentId: "pi_test_1",
      orderId: "ord_1",
      amountCents: 1200,
    });

    const refunded = pay.verifyWebhook(
      JSON.stringify({
        id: "evt_2",
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_1",
            payment_intent: "pi_test_1",
            amount_refunded: 1200,
          },
        },
      }),
      "sig",
    );
    expect(refunded).toMatchObject({
      type: "refunded",
      paymentIntentId: "pi_test_1",
      amountCents: 1200,
    });

    const failed = pay.verifyWebhook(
      JSON.stringify({
        id: "evt_3",
        type: "payment_intent.payment_failed",
        data: { object: { id: "pi_test_1", metadata: { order_id: "ord_1" } } },
      }),
      "sig",
    );
    expect(failed.type).toBe("payment_failed");
  });
});
