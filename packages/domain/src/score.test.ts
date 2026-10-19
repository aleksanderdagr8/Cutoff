import { describe, expect, it } from "vitest";
import {
  applyMerchantScores,
  excludeSuspendedMerchants,
  pickWinner,
  scoreFromEvents,
} from "./index.js";

describe("scoreFromEvents", () => {
  it("starts at zero with no events", () => {
    expect(scoreFromEvents([])).toBe(0);
  });

  it("rewards on-time and penalizes cancel / refund / late", () => {
    expect(scoreFromEvents([{ kind: "on_time" }])).toBe(1);
    expect(scoreFromEvents([{ kind: "late" }])).toBe(-1);
    expect(scoreFromEvents([{ kind: "cancel" }])).toBe(-2);
    expect(scoreFromEvents([{ kind: "refund" }])).toBe(-2);
    expect(
      scoreFromEvents([
        { kind: "on_time" },
        { kind: "on_time" },
        { kind: "cancel" },
      ]),
    ).toBe(0);
  });
});

describe("applyMerchantScores / excludeSuspendedMerchants", () => {
  it("overlays scores and drops suspended fulfillers", () => {
    const offers = [
      {
        offerId: "o1",
        fulfillerId: "fulfiller_a",
        landedCents: 100,
        deliveryDateUtc: "2026-10-21",
        merchantScore: 0,
        priceCents: 100,
        taxCents: 0,
        inStock: true,
        freshUntilUtc: "2026-10-20T00:00:00.000Z",
      },
      {
        offerId: "o2",
        fulfillerId: "fulfiller_b",
        landedCents: 100,
        deliveryDateUtc: "2026-10-21",
        merchantScore: 0,
        priceCents: 100,
        taxCents: 0,
        inStock: true,
        freshUntilUtc: "2026-10-20T00:00:00.000Z",
      },
    ];
    const scored = applyMerchantScores(
      offers,
      new Map([
        ["fulfiller_a", -2],
        ["fulfiller_b", 1],
      ]),
    );
    const active = excludeSuspendedMerchants(scored, (id) => id === "x");
    const winner = pickWinner(active);
    expect(winner?.fulfillerId).toBe("fulfiller_b");
    expect(winner?.merchantScore).toBe(1);
  });

  it("equal price, worse on-time loses", () => {
    const offers = applyMerchantScores(
      [
        {
          offerId: "a",
          fulfillerId: "fulfiller_a",
          landedCents: 1299,
          deliveryDateUtc: "2026-10-21",
          merchantScore: 0,
          priceCents: 1299,
          taxCents: 0,
          inStock: true,
          freshUntilUtc: "2099-01-01T00:00:00.000Z",
        },
        {
          offerId: "b",
          fulfillerId: "fulfiller_b",
          landedCents: 1299,
          deliveryDateUtc: "2026-10-21",
          merchantScore: 0,
          priceCents: 1299,
          taxCents: 0,
          inStock: true,
          freshUntilUtc: "2099-01-01T00:00:00.000Z",
        },
      ],
      new Map([
        ["fulfiller_a", -1], // late
        ["fulfiller_b", 1], // on-time
      ]),
    );
    expect(pickWinner(offers)?.fulfillerId).toBe("fulfiller_b");
  });
});
