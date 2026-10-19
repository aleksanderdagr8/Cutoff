import { describe, expect, it } from "vitest";
import {
  FakeEmailNotifyAdapter,
  MemoryOutboundWebhookQueue,
  MemorySecretStore,
  TestWebhookReceiver,
  verifyOutboundWebhook,
} from "@cutoff/adapters";
import {
  deliverNudgeJob,
  NUDGE_MAX_ATTEMPTS,
  processPendingNudges,
} from "./handlers/nudge-deliver.js";
import { runNudgeCron } from "./handlers/nudge-cron.js";
import {
  seedHouseholdWithMandateAndAgent,
  testBindings,
  TEST_WEBHOOK_SECRET,
} from "./test-helpers.js";

describe("Phase 15 — Unit 21 nudge delivery", () => {
  it("delivers signed agent webhook with x-cutoff-delivery-id", async () => {
    const bindings = testBindings({
      nowUtc: () => "2026-10-19T12:00:00.000Z",
    });
    const secrets = bindings.secrets as MemorySecretStore;
    secrets.set("ref_hh", "whsec_household");
    const receiver = new TestWebhookReceiver("whsec_household");

    bindings.nudgeFetch = async (_input, init) => {
      const headers = new Headers(init?.headers);
      const body = String(init?.body ?? "");
      const ok = await verifyOutboundWebhook(
        "whsec_household",
        {
          timestamp: headers.get("x-cutoff-timestamp") ?? undefined,
          signature: headers.get("x-cutoff-signature") ?? undefined,
        },
        body,
      );
      expect(headers.get("x-cutoff-delivery-id")).toMatch(/^nudge_/);
      if (!ok) {
        receiver.rejected.push({ reason: "unsigned" });
        return new Response("unsigned", { status: 401 });
      }
      await receiver.receive(body, {
        "x-cutoff-timestamp": headers.get("x-cutoff-timestamp")!,
        "x-cutoff-signature": headers.get("x-cutoff-signature")!,
      });
      return new Response("ok", { status: 200 });
    };

    const { household, mandate } = await seedHouseholdWithMandateAndAgent(
      bindings,
    );
    await bindings.nudgeSettings.upsert({
      householdId: household.householdId,
      agentWebhookUrl: "https://agent.example/cutoff",
      agentWebhookSecretRef: "ref_hh",
      emailEnabled: false,
      nowUtc: bindings.nowUtc(),
    });

    const line = await bindings.list.upsert({
      householdId: household.householdId,
      mandateId: mandate.mandateId,
      canonicalItemId: "item_towels_12",
      cadenceHintDays: 30,
      leadDays: 3,
      nowUtc: "2026-09-01T12:00:00.000Z",
    });
    await bindings.list.recordOrder(
      line.lineId,
      "ord_seed",
      "2026-09-21T12:00:00.000Z",
    );

    const cron = await runNudgeCron(bindings);
    expect(cron.created).toBe(1);

    const drained = await processPendingNudges(bindings);
    expect(drained.ok).toBe(1);
    expect(receiver.accepted).toHaveLength(1);

    const nudges = await bindings.reorderNudges.listForHousehold(
      household.householdId,
    );
    expect(nudges[0]?.status).toBe("sent");
    expect(nudges[0]?.channel).toBe("agent_webhook");
  });

  it("sends email channel via FakeEmailNotifyAdapter", async () => {
    const bindings = testBindings({
      nowUtc: () => "2026-10-19T12:00:00.000Z",
    });
    const { household, mandate } = await seedHouseholdWithMandateAndAgent(
      bindings,
    );
    // No agent webhook → email only
    await bindings.nudgeSettings.upsert({
      householdId: household.householdId,
      emailEnabled: true,
      nowUtc: bindings.nowUtc(),
    });

    const line = await bindings.list.upsert({
      householdId: household.householdId,
      mandateId: mandate.mandateId,
      canonicalItemId: "item_coffee_12oz",
      cadenceHintDays: 30,
      leadDays: 3,
      nowUtc: "2026-09-01T12:00:00.000Z",
    });
    await bindings.list.recordOrder(
      line.lineId,
      "ord_c",
      "2026-09-21T12:00:00.000Z",
    );

    await runNudgeCron(bindings);
    const drained = await processPendingNudges(bindings);
    expect(drained.ok).toBe(1);

    const email = bindings.emailNotify as FakeEmailNotifyAdapter;
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]?.lineId).toBe(line.lineId);

    const nudges = await bindings.reorderNudges.listForHousehold(
      household.householdId,
    );
    expect(nudges[0]?.status).toBe("sent");
    expect(nudges[0]?.channel).toBe("email");
  });

  it("falls back to email after 5 failed agent webhook attempts", async () => {
    const bindings = testBindings();
    bindings.nudgeFetch = async () => new Response("down", { status: 503 });

    const inserted = await bindings.reorderNudges.insert({
      householdId: "hh_1",
      lineId: "ll_1",
      dueAt: "2026-10-21T12:00:00.000Z",
      channel: "agent_webhook",
      nowUtc: bindings.nowUtc(),
    });
    expect(inserted.ok && inserted.created).toBe(true);
    if (!inserted.ok) return;

    await bindings.nudgeSettings.upsert({
      householdId: "hh_1",
      agentWebhookUrl: "https://agent.example/cutoff",
      agentWebhookSecretRef: "ref_x",
      nowUtc: bindings.nowUtc(),
    });
    (bindings.secrets as MemorySecretStore).set("ref_x", TEST_WEBHOOK_SECRET);

    const job = {
      deliveryId: `nudge_${inserted.nudge.nudgeId}`,
      url: "https://agent.example/cutoff",
      eventType: "reorder.due",
      body: JSON.stringify({
        type: "reorder.due",
        nudge_id: inserted.nudge.nudgeId,
        household_id: "hh_1",
        line_id: "ll_1",
        display_name: "Coffee",
        due_at: "2026-10-21T12:00:00.000Z",
      }),
      createdAtUtc: bindings.nowUtc(),
    };

    let last = await deliverNudgeJob(bindings, job);
    for (let i = 1; i < NUDGE_MAX_ATTEMPTS; i += 1) {
      last = await deliverNudgeJob(bindings, job);
    }
    expect(last.ok).toBe(false);
    expect(last.fallbackEmail).toBe(true);
    expect(NUDGE_MAX_ATTEMPTS).toBe(5);

    const email = bindings.emailNotify as FakeEmailNotifyAdapter;
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]?.displayName).toBe("Coffee");

    const row = await bindings.reorderNudges.get(inserted.nudge.nudgeId);
    expect(row?.attempts).toBe(5);
    expect(row?.status).toBe("failed");
  });

  it("rejects unsigned delivery path via TestWebhookReceiver", async () => {
    const queue = new MemoryOutboundWebhookQueue();
    const receiver = new TestWebhookReceiver(TEST_WEBHOOK_SECRET);
    queue.enqueue({
      url: "https://agent.example/x",
      eventType: "reorder.due",
      body: JSON.stringify({ type: "reorder.due" }),
      createdAtUtc: "2026-10-19T12:00:00.000Z",
    });
    const unsigned = await queue.drainOne({
      secret: TEST_WEBHOOK_SECRET,
      receiver,
      nowUnix: 1_700_000_000,
      sign: false,
    });
    expect(unsigned.ok).toBe(false);
    expect(receiver.rejected.length).toBe(1);
  });
});
