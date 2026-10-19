import { describe, expect, it } from "vitest";
import { SkipListLineResponseSchema } from "@cutoff/contracts";
import { createApp } from "./app.js";
import {
  defaultCommitEvidence,
  seedHouseholdWithMandateAndAgent,
  testBindings,
} from "./test-helpers.js";

describe("Phase 9 — Unit 15 skip modes + reorder nudge_id", () => {
  it("default skip mode is pause (backward compatible)", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { household, mandate, agent } =
      await seedHouseholdWithMandateAndAgent(bindings);

    const upsert = await app.fetch(
      new Request(
        `http://localhost/v1/households/${household.householdId}/list`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mandate_id: mandate.mandateId,
            canonical_item_id: "item_towels_12",
            cadence_hint_days: 30,
          }),
        },
      ),
      bindings,
    );
    const line = (await upsert.json()) as { line_id: string };

    const skip = await app.fetch(
      new Request("http://localhost/v1/list/skip", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify({ list_line_id: line.line_id }),
      }),
      bindings,
    );
    expect(skip.status).toBe(200);
    const body = SkipListLineResponseSchema.parse(await skip.json());
    expect(body.mode).toBe("pause");
    expect(body.paused).toBe(true);
    expect(body.next_due_at).toBeNull();
  });

  it("next advances next_due_at; snooze sets snoozed_until; pending nudges skipped", async () => {
    const bindings = testBindings({
      nowUtc: () => "2026-10-19T12:00:00.000Z",
    });
    const app = createApp();
    const { household, mandate, agent } =
      await seedHouseholdWithMandateAndAgent(bindings);

    const line = await bindings.list.upsert({
      householdId: household.householdId,
      mandateId: mandate.mandateId,
      canonicalItemId: "item_towels_12",
      cadenceHintDays: 30,
      nowUtc: "2026-09-01T12:00:00.000Z",
    });
    await bindings.list.recordOrder(
      line.lineId,
      "ord_seed",
      "2026-09-21T12:00:00.000Z",
    );
    const before = await bindings.list.get(line.lineId);
    expect(before?.nextDueAt).toBe("2026-10-21T12:00:00.000Z");

    const nudge = await bindings.reorderNudges.insert({
      householdId: household.householdId,
      lineId: line.lineId,
      dueAt: "2026-10-21T12:00:00.000Z",
      channel: "agent_webhook",
      nowUtc: bindings.nowUtc(),
    });
    expect(nudge.ok && nudge.created).toBe(true);

    const nextSkip = await app.fetch(
      new Request("http://localhost/v1/list/skip", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify({
          list_line_id: line.lineId,
          mode: "next",
        }),
      }),
      bindings,
    );
    expect(nextSkip.status).toBe(200);
    const nextBody = SkipListLineResponseSchema.parse(await nextSkip.json());
    expect(nextBody.mode).toBe("next");
    expect(nextBody.paused).toBe(false);
    expect(nextBody.next_due_at).toBe("2026-11-20T12:00:00.000Z");

    if (nudge.ok) {
      const skippedNudge = await bindings.reorderNudges.get(nudge.nudge.nudgeId);
      expect(skippedNudge?.status).toBe("skipped");
    }

    // Fresh pending nudge for snooze path.
    const nudge2 = await bindings.reorderNudges.insert({
      householdId: household.householdId,
      lineId: line.lineId,
      dueAt: "2026-11-20T12:00:00.000Z",
      channel: "email",
      nowUtc: bindings.nowUtc(),
    });

    const snooze = await app.fetch(
      new Request("http://localhost/v1/list/skip", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify({
          list_line_id: line.lineId,
          mode: "snooze",
          until: "2026-10-26T12:00:00.000Z",
        }),
      }),
      bindings,
    );
    expect(snooze.status).toBe(200);
    const snoozeBody = SkipListLineResponseSchema.parse(await snooze.json());
    expect(snoozeBody.mode).toBe("snooze");
    expect(snoozeBody.snoozed_until).toBe("2026-10-26T12:00:00.000Z");
    expect(snoozeBody.paused).toBe(false);

    if (nudge2.ok) {
      expect(
        (await bindings.reorderNudges.get(nudge2.nudge.nudgeId))?.status,
      ).toBe("skipped");
    }

    // Snoozed line is hidden from due list even if next_due_at is near.
    const due = await app.fetch(
      new Request("http://localhost/v1/list/due?within_days=60", {
        headers: { Authorization: `Bearer ${agent.secret}` },
      }),
      bindings,
    );
    expect(due.status).toBe(200);
    const dueBody = (await due.json()) as { lines: unknown[] };
    expect(dueBody.lines).toHaveLength(0);
  });

  it("reorder nudge_id marks acted + resolved_order_id on commit", async () => {
    const bindings = testBindings({
      nowUtc: () => "2026-10-19T12:00:00.000Z",
    });
    const app = createApp();
    const { household, mandate, agent } =
      await seedHouseholdWithMandateAndAgent(bindings);

    const upsert = await app.fetch(
      new Request(
        `http://localhost/v1/households/${household.householdId}/list`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mandate_id: mandate.mandateId,
            canonical_item_id: "item_towels_12",
            cadence_hint_days: 30,
          }),
        },
      ),
      bindings,
    );
    const line = (await upsert.json()) as { line_id: string };

    const nudge = await bindings.reorderNudges.insert({
      householdId: household.householdId,
      lineId: line.line_id,
      dueAt: "2026-10-21T12:00:00.000Z",
      channel: "agent_webhook",
      nowUtc: bindings.nowUtc(),
    });
    expect(nudge.ok).toBe(true);
    if (!nudge.ok) return;

    const reorder = await app.fetch(
      new Request("http://localhost/v1/list/reorder", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify({
          list_line_id: line.line_id,
          qty: 1,
          deliver_by: "2026-10-22",
          nudge_id: nudge.nudge.nudgeId,
        }),
      }),
      bindings,
    );
    expect(reorder.status).toBe(201);
    const quote = (await reorder.json()) as {
      quote_id: string;
      nudge_id?: string;
    };
    expect(quote.nudge_id).toBe(nudge.nudge.nudgeId);

    const commit = await app.fetch(
      new Request("http://localhost/v1/commits", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
          "Idempotency-Key": "idem_u15_nudge_acted",
        },
        body: JSON.stringify({
          quote_id: quote.quote_id,
          ...defaultCommitEvidence,
        }),
      }),
      bindings,
    );
    expect(commit.status).toBe(201);
    const order = (await commit.json()) as { order_id: string; created: boolean };
    expect(order.created).toBe(true);

    const acted = await bindings.reorderNudges.get(nudge.nudge.nudgeId);
    expect(acted?.status).toBe("acted");
    expect(acted?.resolvedOrderId).toBe(order.order_id);
  });
});
