import { describe, expect, it } from "vitest";
import {
  FakeFulfillAdapter,
  signOutboundWebhook,
  TestWebhookReceiver,
} from "@cutoff/adapters";
import { createApp } from "./app.js";
import {
  defaultCommitEvidence,
  seedHouseholdWithMandateAndAgent,
  testBindings,
  TEST_WEBHOOK_SECRET,
} from "./test-helpers.js";

async function quoteAndCommit(
  app: ReturnType<typeof createApp>,
  bindings: ReturnType<typeof testBindings>,
  opts: {
    mandateId: string;
    secret: string;
    idempotencyKey: string;
  },
) {
  const quoteRes = await app.fetch(
    new Request("http://localhost/v1/quotes", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${opts.secret}`,
      },
      body: JSON.stringify({
        mandate_id: opts.mandateId,
        canonical_item_id: "item_towels_12",
        qty: 1,
        deliver_by: "2026-10-22",
      }),
    }),
    bindings,
  );
  expect(quoteRes.status).toBe(201);
  const quote = (await quoteRes.json()) as { quote_id: string };

  const commitRes = await app.fetch(
    new Request("http://localhost/v1/commits", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${opts.secret}`,
        "Idempotency-Key": opts.idempotencyKey,
      },
      body: JSON.stringify({
        quote_id: quote.quote_id,
        ...defaultCommitEvidence,
      }),
    }),
    bindings,
  );
  return { quote, commitRes };
}

describe("Phase 4 exit — fulfill / notify", () => {
  it("placed order produces a tracking event the agent can fetch", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(bindings);

    const { commitRes } = await quoteAndCommit(app, bindings, {
      mandateId: mandate.mandateId,
      secret: agent.secret,
      idempotencyKey: "idem_p4_track",
    });
    expect(commitRes.status).toBe(201);
    const commit = (await commitRes.json()) as {
      order_id: string;
      status: string;
      job_id: string;
    };
    expect(commit.status).toBe("placed");
    expect(commit.job_id).toBeTruthy();

    const body = JSON.stringify({
      event_id: "ful_evt_1",
      order_id: commit.order_id,
      job_id: commit.job_id,
      status: "shipped",
      tracking_number: "1Z999",
      occurred_at: "2026-10-19T12:00:00.000Z",
    });
    const headers = await signOutboundWebhook(
      TEST_WEBHOOK_SECRET,
      Math.floor(Date.parse("2026-10-19T12:00:00.000Z") / 1000),
      body,
    );
    const inbound = await app.fetch(
      new Request("http://localhost/v1/webhooks/fulfill", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        body,
      }),
      bindings,
    );
    expect(inbound.status).toBe(201);

    const track = await app.fetch(
      new Request(`http://localhost/v1/orders/${commit.order_id}`, {
        headers: { Authorization: `Bearer ${agent.secret}` },
      }),
      bindings,
    );
    expect(track.status).toBe(200);
    const json = (await track.json()) as {
      status: string;
      tracking_number: string;
      shipment_events: Array<{ event_id: string }>;
    };
    expect(json.status).toBe("shipped");
    expect(json.tracking_number).toBe("1Z999");
    expect(json.shipment_events).toHaveLength(1);
  });

  it("cancel after ship fails cleanly with not_cancellable", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(
      bindings,
      { allowCancel: true },
    );

    const { commitRes } = await quoteAndCommit(app, bindings, {
      mandateId: mandate.mandateId,
      secret: agent.secret,
      idempotencyKey: "idem_p4_cancel_ship",
    });
    const commit = (await commitRes.json()) as {
      order_id: string;
      job_id: string;
    };

    const body = JSON.stringify({
      event_id: "ful_evt_ship",
      order_id: commit.order_id,
      job_id: commit.job_id,
      status: "shipped",
      tracking_number: "1Z111",
      occurred_at: "2026-10-19T12:00:00.000Z",
    });
    const headers = await signOutboundWebhook(
      TEST_WEBHOOK_SECRET,
      Math.floor(Date.parse("2026-10-19T12:00:00.000Z") / 1000),
      body,
    );
    await app.fetch(
      new Request("http://localhost/v1/webhooks/fulfill", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body,
      }),
      bindings,
    );

    const cancel = await app.fetch(
      new Request("http://localhost/v1/orders/cancel", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify({ order_id: commit.order_id }),
      }),
      bindings,
    );
    expect(cancel.status).toBe(403);
    expect(await cancel.json()).toEqual({ error: "not_cancellable" });
  });
});

describe("U9 fulfill and notify", () => {
  it("place failure after capture enqueues refund; no job left stranded", async () => {
    const fulfill = new FakeFulfillAdapter();
    fulfill.failNextPlace = true;
    const bindings = testBindings({ fulfill });
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(bindings);

    const { commitRes } = await quoteAndCommit(app, bindings, {
      mandateId: mandate.mandateId,
      secret: agent.secret,
      idempotencyKey: "idem_place_fail",
    });
    expect(commitRes.status).toBe(201);
    const json = (await commitRes.json()) as {
      order_id: string;
      status: string;
      refund_id: string;
      job_id?: string;
    };
    expect(json.status).toBe("captured");
    expect(json.refund_id).toBeTruthy();
    expect(json.job_id).toBeUndefined();
    expect(bindings.fulfillment.listJobs()).toHaveLength(0);
    expect(bindings.fulfillment.listRefunds(json.order_id)).toHaveLength(1);
    expect(bindings.fulfillment.listRefunds(json.order_id)[0]?.reason).toBe(
      "place_failed",
    );
  });

  it("replayed inbound webhook writes one shipment event", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(bindings);

    const { commitRes } = await quoteAndCommit(app, bindings, {
      mandateId: mandate.mandateId,
      secret: agent.secret,
      idempotencyKey: "idem_replay",
    });
    const commit = (await commitRes.json()) as {
      order_id: string;
      job_id: string;
    };

    const body = JSON.stringify({
      event_id: "ful_evt_dup",
      order_id: commit.order_id,
      job_id: commit.job_id,
      status: "shipped",
      tracking_number: "1Z222",
      occurred_at: "2026-10-19T12:00:00.000Z",
    });
    const headers = await signOutboundWebhook(
      TEST_WEBHOOK_SECRET,
      Math.floor(Date.parse("2026-10-19T12:00:00.000Z") / 1000),
      body,
    );

    const first = await app.fetch(
      new Request("http://localhost/v1/webhooks/fulfill", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body,
      }),
      bindings,
    );
    expect(first.status).toBe(201);

    const second = await app.fetch(
      new Request("http://localhost/v1/webhooks/fulfill", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body,
      }),
      bindings,
    );
    expect(second.status).toBe(200);
    const secondJson = (await second.json()) as { created: boolean };
    expect(secondJson.created).toBe(false);
    expect(
      bindings.fulfillment.listShipmentEvents(commit.order_id),
    ).toHaveLength(1);
  });

  it("unsigned outbound is rejected by the test receiver", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(bindings);

    await quoteAndCommit(app, bindings, {
      mandateId: mandate.mandateId,
      secret: agent.secret,
      idempotencyKey: "idem_unsigned",
    });
    expect(bindings.outboundWebhooks.pending.length).toBeGreaterThan(0);

    const receiver = new TestWebhookReceiver(TEST_WEBHOOK_SECRET);
    const unsigned = await bindings.outboundWebhooks.drainOne({
      secret: TEST_WEBHOOK_SECRET,
      receiver,
      nowUnix: Math.floor(Date.parse("2026-10-19T12:00:00.000Z") / 1000),
      sign: false,
    });
    expect(unsigned).toEqual({ ok: false, error: "unsigned" });
    expect(receiver.rejected).toHaveLength(1);
    expect(receiver.accepted).toHaveLength(0);

    const signed = await bindings.outboundWebhooks.drainOne({
      secret: TEST_WEBHOOK_SECRET,
      receiver,
      nowUnix: Math.floor(Date.parse("2026-10-19T12:00:00.000Z") / 1000),
      sign: true,
    });
    expect(signed).toEqual({ ok: true });
    expect(receiver.accepted).toHaveLength(1);
  });

  it("cancel after ship returns not_cancellable", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(
      bindings,
      { allowCancel: true },
    );

    const { commitRes } = await quoteAndCommit(app, bindings, {
      mandateId: mandate.mandateId,
      secret: agent.secret,
      idempotencyKey: "idem_u9_cancel",
    });
    const commit = (await commitRes.json()) as {
      order_id: string;
      job_id: string;
    };

    // Force shipped via ledger without webhook (status gate).
    await bindings.orders.appendStatus(
      commit.order_id,
      "shipped",
      "2026-10-19T12:00:00.000Z",
    );

    const cancel = await app.fetch(
      new Request("http://localhost/v1/orders/cancel", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify({ order_id: commit.order_id }),
      }),
      bindings,
    );
    expect(cancel.status).toBe(403);
    expect(await cancel.json()).toEqual({ error: "not_cancellable" });
  });
});
