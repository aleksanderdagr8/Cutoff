import { describe, expect, it } from "vitest";
import {
  AGENT_ORDER_RECEIPT_ALLOWLIST,
  AGENT_ORDER_RECEIPT_FORBIDDEN_KEYS,
  agentOrderReceiptHasForbiddenKey,
  agentOrderReceiptUnknownKeys,
  canViewReceipt,
  receiptSkipAction,
  serializeAgentOrderReceipt,
  whyThisSeller,
} from "./receipt.js";

describe("Unit 10 receipt domain", () => {
  it("member of household can view; non-member cannot", () => {
    expect(
      canViewReceipt(
        { role: "member", memberId: "m1", householdId: "h1" },
        "h1",
      ),
    ).toBe(true);
    expect(
      canViewReceipt(
        { role: "member", memberId: "m2", householdId: "h2" },
        "h1",
      ),
    ).toBe(false);
    expect(canViewReceipt({ role: "anon" }, "h1")).toBe(false);
  });

  it("skip before ship cancels; after ship opens return", () => {
    expect(receiptSkipAction("placed")).toBe("cancel");
    expect(receiptSkipAction("captured")).toBe("cancel");
    expect(receiptSkipAction("shipped")).toBe("return_request");
    expect(receiptSkipAction("delivered")).toBe("return_request");
    expect(receiptSkipAction("refunded")).toBe("none");
  });

  it("why-this-seller exposes only the three rank inputs", () => {
    expect(
      whyThisSeller({
        landedCents: 1299,
        deliveryDateUtc: "2026-10-21",
        merchantScore: 0,
      }),
    ).toEqual({
      landed_cents: 1299,
      delivery_date: "2026-10-21",
      merchant_score: 0,
    });
  });
});

describe("Unit 16 agent order receipt allowlist", () => {
  it("serializeAgentOrderReceipt emits only allowlisted keys + summary", () => {
    const payload = serializeAgentOrderReceipt({
      orderId: "ord_1",
      status: "placed",
      amountCents: 1299,
      canonicalItemId: "item_towels_12",
      displayName: "Paper towels, 12-roll pack",
      fulfillerId: "fulfiller_a",
      whyThisSeller: {
        landed_cents: 1299,
        delivery_date: "2026-10-21",
        merchant_score: 0,
      },
      jobId: "job_1",
      trackingNumber: null,
      shipmentEvents: [],
      receiptUrl: "/home/receipts/rcpt_1",
    });

    expect(Object.keys(payload).sort()).toEqual(
      [...AGENT_ORDER_RECEIPT_ALLOWLIST].sort(),
    );
    expect(payload.summary).toContain("Paper towels");
    expect(payload.summary).toContain("$12.99");
    expect(agentOrderReceiptUnknownKeys(payload as Record<string, unknown>)).toEqual(
      [],
    );
    expect(
      agentOrderReceiptHasForbiddenKey(payload as Record<string, unknown>),
    ).toBe(false);
  });

  it("forbidden PII keys are detected by the contract helper", () => {
    expect(
      agentOrderReceiptHasForbiddenKey({
        order_id: "ord_1",
        email: "a@example.com",
      }),
    ).toBe(true);
    expect(AGENT_ORDER_RECEIPT_FORBIDDEN_KEYS).toContain("last4");
    expect(AGENT_ORDER_RECEIPT_FORBIDDEN_KEYS).toContain("secret_hash");
  });
});
