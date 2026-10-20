import { PayWebhookSignatureError } from "@cutoff/adapters";
import type { ApiBindings } from "../bindings.js";

async function findOrder(
  bindings: ApiBindings,
  paymentIntentId: string | null,
  orderId: string | null,
) {
  if (paymentIntentId) {
    const byIntent = await bindings.orders.getByChargeId(paymentIntentId);
    if (byIntent) return byIntent;
  }
  if (orderId) return bindings.orders.get(orderId);
  return null;
}

/**
 * Stripe webhooks. Signature is verified inside the pay adapter.
 * Success, failure, and refund update the order. Plan events only store
 * the Stripe Customer id — never a balance.
 */
export async function stripeWebhookHandler(
  bindings: ApiBindings,
  rawBody: string,
  signature: string | undefined,
) {
  if (!bindings.pay.verifyWebhook) {
    return { status: 404 as const, body: { error: "not_found" as const } };
  }

  let event;
  try {
    event = bindings.pay.verifyWebhook(rawBody, signature);
  } catch (error) {
    if (error instanceof PayWebhookSignatureError) {
      return {
        status: 400 as const,
        body: { error: "invalid_signature" as const },
      };
    }
    throw error;
  }

  const nowUtc = bindings.nowUtc();
  switch (event.type) {
    case "payment_succeeded": {
      const order = await findOrder(
        bindings,
        event.paymentIntentId,
        event.orderId,
      );
      if (order) {
        await bindings.orders.noteCapturedPayment({
          orderId: order.orderId,
          chargeId: order.chargeId ?? event.paymentIntentId,
          amountCents: order.amountCents,
          atUtc: nowUtc,
        });
      }
      break;
    }
    case "payment_failed":
    case "payment_canceled": {
      const order = await findOrder(
        bindings,
        event.paymentIntentId,
        event.orderId,
      );
      if (order) await bindings.orders.notePaymentFailed(order.orderId, nowUtc);
      break;
    }
    case "refunded": {
      const order = await findOrder(
        bindings,
        event.paymentIntentId,
        event.orderId,
      );
      if (order && event.amountCents >= order.amountCents) {
        await bindings.orders.noteRefunded(order.orderId, nowUtc);
      }
      break;
    }
    case "plan_checkout_completed": {
      if (event.householdId && event.customerId) {
        await bindings.households.setStripeCustomerId(
          event.householdId,
          event.customerId,
        );
      }
      break;
    }
    case "plan_subscription":
    case "plan_invoice":
    case "risk_signal":
    case "ignored":
      break;
    default:
      break;
  }

  return {
    status: 200 as const,
    body: { received: true as const, type: event.type },
  };
}
