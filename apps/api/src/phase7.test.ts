import { describe, expect, it } from "vitest";
import { DueListResponseSchema, ListResponseSchema } from "@cutoff/contracts";
import { createApp } from "./app.js";
import {
  defaultCommitEvidence,
  seedHouseholdWithMandateAndAgent,
  testBindings,
} from "./test-helpers.js";

describe("Phase 7 — Unit 13 list due", () => {
  it("GET /v1/list includes display_name and next_due_at after commit", async () => {
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
    const created = (await upsert.json()) as {
      line_id: string;
      display_name: string | null;
      next_due_at: string | null;
    };
    expect(created.display_name).toBe("Paper towels, 12-roll pack");
    expect(created.next_due_at).toBeNull();

    const reorder = await app.fetch(
      new Request("http://localhost/v1/list/reorder", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify({
          list_line_id: created.line_id,
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
          "Idempotency-Key": "idem_u13_list_fields",
        },
        body: JSON.stringify({
          quote_id: quote.quote_id,
          ...defaultCommitEvidence,
        }),
      }),
      bindings,
    );
    expect(commit.status).toBe(201);

    const list = await app.fetch(
      new Request("http://localhost/v1/list", {
        headers: { Authorization: `Bearer ${agent.secret}` },
      }),
      bindings,
    );
    expect(list.status).toBe(200);
    const body = ListResponseSchema.parse(await list.json());
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0]?.display_name).toBe("Paper towels, 12-roll pack");
    expect(body.lines[0]?.next_due_at).toBe("2026-11-18T12:00:00.000Z");
  });

  it("GET /v1/list/due returns due lines with reason; paused excluded", async () => {
    const bindings = testBindings({
      nowUtc: () => "2026-10-19T12:00:00.000Z",
    });
    const app = createApp();
    const { household, mandate, agent } =
      await seedHouseholdWithMandateAndAgent(bindings, {
        itemId: "item_coffee_12oz",
      });

    // Due soon: ordered 28 days ago, cadence 30 → due in 2 days.
    const dueLine = await bindings.list.upsert({
      householdId: household.householdId,
      mandateId: mandate.mandateId,
      canonicalItemId: "item_coffee_12oz",
      cadenceHintDays: 30,
      neverSubstitute: false,
      nowUtc: "2026-09-01T12:00:00.000Z",
    });
    await bindings.list.recordOrder(
      dueLine.lineId,
      "ord_seed_due",
      "2026-09-21T12:00:00.000Z",
    );

    // Not due yet: ordered today, cadence 90.
    const later = await bindings.list.upsert({
      householdId: household.householdId,
      mandateId: mandate.mandateId,
      canonicalItemId: "item_towels_12",
      cadenceHintDays: 90,
      neverSubstitute: true,
      nowUtc: "2026-10-19T12:00:00.000Z",
    });
    await bindings.list.recordOrder(
      later.lineId,
      "ord_seed_later",
      "2026-10-19T12:00:00.000Z",
    );

    // Paused — never due even with history.
    const paused = await bindings.list.upsert({
      householdId: household.householdId,
      mandateId: mandate.mandateId,
      canonicalItemId: "item_filter_1",
      cadenceHintDays: 30,
      nowUtc: "2026-09-01T12:00:00.000Z",
    });
    await bindings.list.recordOrder(
      paused.lineId,
      "ord_seed_paused",
      "2026-09-01T12:00:00.000Z",
    );
    await bindings.list.skip(paused.lineId);

    const dueRes = await app.fetch(
      new Request("http://localhost/v1/list/due?within_days=7", {
        headers: { Authorization: `Bearer ${agent.secret}` },
      }),
      bindings,
    );
    expect(dueRes.status).toBe(200);
    const dueBody = DueListResponseSchema.parse(await dueRes.json());
    expect(dueBody.within_days).toBe(7);
    expect(dueBody.lines).toHaveLength(1);
    expect(dueBody.lines[0]?.line_id).toBe(dueLine.lineId);
    expect(dueBody.lines[0]?.display_name).toBe("Ground coffee, 12 oz bag");
    expect(dueBody.lines[0]?.next_due_at).toBe("2026-10-21T12:00:00.000Z");
    expect(dueBody.lines[0]?.reason).toBe(
      "every 30 days, last ordered 2026-09-21",
    );
    expect(dueBody.lines[0]?.nudge_id).toBeNull();
  });

  it("GET /v1/list/due requires read_list and defaults within_days to 7", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { agent } = await seedHouseholdWithMandateAndAgent(bindings, {
      scopes: ["quote", "commit"],
    });

    const denied = await app.fetch(
      new Request("http://localhost/v1/list/due", {
        headers: { Authorization: `Bearer ${agent.secret}` },
      }),
      bindings,
    );
    expect(denied.status).toBe(401);

    const { agent: reader } = await seedHouseholdWithMandateAndAgent(
      bindings,
      { scopes: ["read_list"] },
    );
    const ok = await app.fetch(
      new Request("http://localhost/v1/list/due", {
        headers: { Authorization: `Bearer ${reader.secret}` },
      }),
      bindings,
    );
    expect(ok.status).toBe(200);
    const body = DueListResponseSchema.parse(await ok.json());
    expect(body.within_days).toBe(7);
    expect(body.lines).toEqual([]);
  });
});
