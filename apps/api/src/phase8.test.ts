import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import {
  defaultCommitEvidence,
  seedHouseholdWithMandateAndAgent,
  testBindings,
} from "./test-helpers.js";

describe("Phase 8 — Unit 14 reorder schedule persistence", () => {
  it("commit persists lastOrderedAt + nextDueAt on the list line", async () => {
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
    expect(upsert.status).toBe(201);
    const line = (await upsert.json()) as { line_id: string };

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
        }),
      }),
      bindings,
    );
    expect(reorder.status).toBe(201);
    const quote = (await reorder.json()) as { quote_id: string };

    const commit = await app.fetch(
      new Request("http://localhost/v1/commits", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
          "Idempotency-Key": "idem_u14_persist",
        },
        body: JSON.stringify({
          quote_id: quote.quote_id,
          ...defaultCommitEvidence,
        }),
      }),
      bindings,
    );
    expect(commit.status).toBe(201);

    const stored = await bindings.list.get(line.line_id);
    expect(stored?.cadenceSource).toBe("fixed");
    expect(stored?.learnedIntervalDays).toBeNull();
    expect(stored?.lastOrderedAt).toBe("2026-10-19T12:00:00.000Z");
    expect(stored?.nextDueAt).toBe("2026-11-18T12:00:00.000Z");
    expect(stored?.leadDays).toBe(3);
    expect(stored?.snoozedUntil).toBeNull();
  });

  it("nudge settings stay auto_commit false; nudge insert is idempotent", async () => {
    const bindings = testBindings({
      nowUtc: () => "2026-10-19T12:00:00.000Z",
    });
    const settings = await bindings.nudgeSettings.upsert({
      householdId: "hh_nudge",
      agentWebhookUrl: "https://agent.example/cutoff",
      agentWebhookSecretRef: "ref_hh_nudge",
      nowUtc: bindings.nowUtc(),
    });
    expect(settings.autoCommitEnabled).toBe(false);

    const first = await bindings.reorderNudges.insert({
      householdId: "hh_nudge",
      lineId: "ll_x",
      dueAt: "2026-10-21T00:00:00.000Z",
      channel: "agent_webhook",
      nowUtc: bindings.nowUtc(),
    });
    expect(first.ok && first.created).toBe(true);
    const second = await bindings.reorderNudges.insert({
      householdId: "hh_nudge",
      lineId: "ll_x",
      dueAt: "2026-10-21T00:00:00.000Z",
      channel: "agent_webhook",
      nowUtc: bindings.nowUtc(),
    });
    expect(second.ok && second.created).toBe(false);
  });
});
