import { describe, expect, it } from "vitest";
import { FakePayAdapter } from "@cutoff/adapters";
import { createApp } from "./app.js";
import { testBindings } from "./test-helpers.js";

describe("U0 fake commit idempotency", () => {
  it("commit twice with the same Idempotency-Key returns the same order id and one row", async () => {
    const bindings = testBindings();
    const app = createApp();

    const body = {
      household_id: "hh_u0",
      canonical_item_id: "item_towels_12",
      quote_id: "qt_u0",
      amount_cents: 1299,
    };

    const req = () =>
      new Request("http://localhost/v1/_phase0/commits", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": "idem_u0_api",
        },
        body: JSON.stringify(body),
      });

    const first = await app.fetch(req(), bindings);
    const second = await app.fetch(req(), bindings);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);

    const firstJson = (await first.json()) as {
      order_id: string;
      created: boolean;
    };
    const secondJson = (await second.json()) as {
      order_id: string;
      created: boolean;
    };

    expect(firstJson.created).toBe(true);
    expect(secondJson.created).toBe(false);
    expect(secondJson.order_id).toBe(firstJson.order_id);
    expect(bindings.orders.count()).toBe(1);
    expect((bindings.pay as FakePayAdapter).charges).toHaveLength(1);
  });

  it("GET /health returns ok for phase 4", async () => {
    const bindings = testBindings();
    const app = createApp();
    const res = await app.fetch(
      new Request("http://localhost/health"),
      bindings,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      service: "cutoff-api",
      phase: "5",
    });
  });
});
