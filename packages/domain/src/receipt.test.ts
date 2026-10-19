import { describe, expect, it } from "vitest";
import {
  canViewReceipt,
  receiptSkipAction,
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
