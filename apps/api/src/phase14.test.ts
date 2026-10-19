import { describe, expect, it } from "vitest";
import type { MemoryOutboundWebhookQueue } from "@cutoff/adapters";
import { runNudgeCron } from "./handlers/nudge-cron.js";
import {
  seedHouseholdWithMandateAndAgent,
  testBindings,
} from "./test-helpers.js";

describe("Phase 14 — Unit 20 nudge cron writer", () => {
  it("inserts idempotent nudge rows and enqueues only newly created ones", async () => {
    const bindings = testBindings({
      nowUtc: () => "2026-10-19T12:00:00.000Z",
    });
    const { household, mandate } = await seedHouseholdWithMandateAndAgent(
      bindings,
    );

    await bindings.nudgeSettings.upsert({
      householdId: household.householdId,
      agentWebhookUrl: "https://agent.example/cutoff",
      agentWebhookSecretRef: "ref_test",
      emailEnabled: true,
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
    // next_due_at = 2026-10-21; with lead_days=3 ready at 2026-10-18 ≤ now.

    const first = await runNudgeCron(bindings);
    expect(first.scanned).toBe(1);
    expect(first.created).toBe(2); // agent_webhook + email
    expect(first.enqueued).toBe(2);
    expect(first.skippedExisting).toBe(0);

    const queue = bindings.nudgeQueue as MemoryOutboundWebhookQueue;
    expect(queue.pending).toHaveLength(2);
    const body = JSON.parse(queue.pending[0]!.body) as {
      type: string;
      line_id: string;
      actions: { quote: string; skip: string };
    };
    expect(body.type).toBe("reorder.due");
    expect(body.line_id).toBe(line.lineId);
    expect(body.actions.quote).toBe("POST /v1/list/reorder");

    const nudges = await bindings.reorderNudges.listForHousehold(
      household.householdId,
    );
    expect(nudges).toHaveLength(2);
    expect(nudges.every((n) => n.status === "pending")).toBe(true);

    // Second tick is idempotent — no new rows, no new enqueues.
    const pendingBefore = queue.pending.length;
    const second = await runNudgeCron(bindings);
    expect(second.created).toBe(0);
    expect(second.skippedExisting).toBe(2);
    expect(second.enqueued).toBe(0);
    expect(queue.pending).toHaveLength(pendingBefore);
    expect(
      (await bindings.reorderNudges.listForHousehold(household.householdId))
        .length,
    ).toBe(2);
  });

  it("skips paused and snoozed lines", async () => {
    const bindings = testBindings({
      nowUtc: () => "2026-10-19T12:00:00.000Z",
    });
    const { household, mandate } = await seedHouseholdWithMandateAndAgent(
      bindings,
    );

    const paused = await bindings.list.upsert({
      householdId: household.householdId,
      mandateId: mandate.mandateId,
      canonicalItemId: "item_towels_12",
      cadenceHintDays: 30,
      nowUtc: "2026-09-01T12:00:00.000Z",
    });
    await bindings.list.recordOrder(
      paused.lineId,
      "ord_a",
      "2026-09-21T12:00:00.000Z",
    );
    await bindings.list.applySkip({
      lineId: paused.lineId,
      mode: "pause",
      nowUtc: bindings.nowUtc(),
    });

    const snoozed = await bindings.list.upsert({
      householdId: household.householdId,
      mandateId: mandate.mandateId,
      canonicalItemId: "item_coffee_12oz",
      cadenceHintDays: 30,
      nowUtc: "2026-09-01T12:00:00.000Z",
    });
    await bindings.list.recordOrder(
      snoozed.lineId,
      "ord_b",
      "2026-09-21T12:00:00.000Z",
    );
    await bindings.list.applySkip({
      lineId: snoozed.lineId,
      mode: "snooze",
      until: "2026-10-26T12:00:00.000Z",
      nowUtc: bindings.nowUtc(),
    });

    const result = await runNudgeCron(bindings);
    expect(result.scanned).toBe(0);
    expect(result.created).toBe(0);
  });
});
