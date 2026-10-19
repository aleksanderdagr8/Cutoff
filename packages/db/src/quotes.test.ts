import { describe, expect, it } from "vitest";
import { MemoryQuoteRepository } from "./quotes.js";

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    householdId: "hh_1",
    mandateId: "m_1",
    agentKeyId: "ak_1",
    canonicalItemId: "item_towels_12",
    qty: 1,
    landedCents: 1299,
    taxCents: 0,
    unitPriceCents: 108,
    deliveryDateUtc: "2026-10-21",
    fulfillerId: "fulfiller_a",
    offerId: "off_1",
    scoreInputs: {
      landedCents: 1299,
      deliveryDateUtc: "2026-10-21",
      merchantScore: 0,
    },
    addressId: "addr_home",
    ceilingCents: 2000,
    nowUtc: "2026-10-19T12:00:00.000Z",
    ...overrides,
  };
}

describe("U6 MemoryQuoteRepository", () => {
  it("placement column does not exist; insert attempt fails", () => {
    const quotes = new MemoryQuoteRepository();
    expect(quotes.schemaHasPlacementColumn()).toBe(false);
    expect(
      quotes.attemptInsertWithPlacement({
        quoteId: "x",
        placement: 1,
      }),
    ).toEqual({ ok: false, error: "placement_rejected" });

    const created = quotes.create(
      baseInput({ placement: 99 }) as ReturnType<typeof baseInput> & {
        placement: number;
      },
    );
    expect(created).toEqual({ ok: false, error: "placement_rejected" });
  });

  it("second open quote for same household+item returns hold_active", () => {
    const quotes = new MemoryQuoteRepository();
    const first = quotes.create(baseInput());
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = quotes.create(baseInput());
    expect(second).toEqual({
      ok: false,
      error: "hold_active",
      quoteId: first.quote.quoteId,
    });
  });

  it("expired quote hold can be replaced", () => {
    const quotes = new MemoryQuoteRepository();
    const first = quotes.create(
      baseInput({ nowUtc: "2026-10-19T12:00:00.000Z", ttlMs: 1000 }),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = quotes.create(
      baseInput({ nowUtc: "2026-10-19T12:00:05.000Z" }),
    );
    expect(second.ok).toBe(true);
  });

  it("quote expiry is under 10 minutes", () => {
    const quotes = new MemoryQuoteRepository();
    const created = quotes.create(baseInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const delta =
      Date.parse(created.quote.expiresAtUtc) -
      Date.parse(created.quote.createdAt);
    expect(delta).toBeLessThan(10 * 60 * 1000);
    expect(delta).toBeGreaterThan(0);
  });
});
