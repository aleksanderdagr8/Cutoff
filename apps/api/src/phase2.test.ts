import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import {
  defaultCommitEvidence,
  seedHouseholdWithMandateAndAgent,
  testBindings,
} from "./test-helpers.js";

describe("Phase 2 exit — catalog / offer / quote", () => {
  it("two fixture fulfillers, same item, cheaper wins", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(bindings);

    const res = await app.fetch(
      new Request("http://localhost/v1/quotes", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify({
          mandate_id: mandate.mandateId,
          canonical_item_id: "item_towels_12",
          qty: 1,
          deliver_by: "2026-10-22",
        }),
      }),
      bindings,
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as {
      landed_cents: number;
      fulfiller_id: string;
      unit_price_cents: number;
    };
    expect(json.fulfiller_id).toBe("fulfiller_a");
    expect(json.landed_cents).toBe(1299);
    // unit price = landed / pack_count
    expect(json.unit_price_cents).toBe(Math.floor(1299 / 12));
  });

  it("a stale offer cannot be quoted", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(bindings);

    for (const offer of bindings.offers.listForItem("item_towels_12")) {
      offer.freshUntilUtc = "2026-10-18T00:00:00.000Z";
    }

    const res = await app.fetch(
      new Request("http://localhost/v1/quotes", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify({
          mandate_id: mandate.mandateId,
          canonical_item_id: "item_towels_12",
          qty: 1,
          deliver_by: "2026-10-22",
        }),
      }),
      bindings,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "stale_offer" });
  });
});

describe("U6 quote holds and never-substitute", () => {
  it("second open quote returns hold_active and first quote id", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(bindings);

    const first = await app.fetch(
      new Request("http://localhost/v1/quotes", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify({
          mandate_id: mandate.mandateId,
          canonical_item_id: "item_towels_12",
          qty: 1,
          deliver_by: "2026-10-22",
        }),
      }),
      bindings,
    );
    expect(first.status).toBe(201);
    const firstJson = (await first.json()) as { quote_id: string };

    const second = await app.fetch(
      new Request("http://localhost/v1/quotes", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify({
          mandate_id: mandate.mandateId,
          canonical_item_id: "item_towels_12",
          qty: 1,
          deliver_by: "2026-10-22",
        }),
      }),
      bindings,
    );
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({
      error: "hold_active",
      quote_id: firstJson.quote_id,
    });
  });

  it("never-substitute returns out_of_stock when exact id has no stock", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(
      bindings,
      { neverSubstitute: true },
    );

    for (const offer of bindings.offers.listForItem("item_towels_12")) {
      offer.inStock = false;
    }

    const res = await app.fetch(
      new Request("http://localhost/v1/quotes", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify({
          mandate_id: mandate.mandateId,
          canonical_item_id: "item_towels_12",
          qty: 1,
          deliver_by: "2026-10-22",
        }),
      }),
      bindings,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "out_of_stock" });
  });

  it("expired quote cannot be committed", async () => {
    let now = "2026-10-19T12:00:00.000Z";
    const bindings = testBindings({ nowUtc: () => now });
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(bindings);

    const quoteRes = await app.fetch(
      new Request("http://localhost/v1/quotes", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify({
          mandate_id: mandate.mandateId,
          canonical_item_id: "item_towels_12",
          qty: 1,
          deliver_by: "2026-10-22",
        }),
      }),
      bindings,
    );
    expect(quoteRes.status).toBe(201);
    const quote = (await quoteRes.json()) as { quote_id: string };

    now = "2026-10-19T12:20:00.000Z";

    const commit = await app.fetch(
      new Request("http://localhost/v1/commits", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
          "Idempotency-Key": "idem_expired",
        },
        body: JSON.stringify({
          quote_id: quote.quote_id,
          ...defaultCommitEvidence,
        }),
      }),
      bindings,
    );
    expect(commit.status).toBe(400);
    expect(await commit.json()).toEqual({ error: "quote_expired" });
  });

  it("recall excludes item from quote", async () => {
    const bindings = testBindings();
    const app = createApp();
    const item = bindings.catalog.get("item_towels_12")!;
    item.recalled = true;

    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(bindings);

    const res = await app.fetch(
      new Request("http://localhost/v1/quotes", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify({
          mandate_id: mandate.mandateId,
          canonical_item_id: "item_towels_12",
          qty: 1,
          deliver_by: "2026-10-22",
        }),
      }),
      bindings,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "out_of_stock" });
  });
});

describe("U5 dual fulfiller visibility to ranker", () => {
  it("both fulfillers are visible before quote picks a winner", () => {
    const bindings = testBindings();
    const towels = bindings.offers.listForItem("item_towels_12");
    expect(towels).toHaveLength(2);
    expect(new Set(towels.map((o) => o.fulfillerId))).toEqual(
      new Set(["fulfiller_a", "fulfiller_b"]),
    );
  });
});
