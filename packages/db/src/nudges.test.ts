import { describe, expect, it } from "vitest";
import {
  MemoryHouseholdNudgeSettingsRepository,
  MemoryReorderNudgeRepository,
} from "./nudges.js";

describe("Unit 14 nudge repos (memory)", () => {
  it("upserts household settings with auto_commit always false", () => {
    const repo = new MemoryHouseholdNudgeSettingsRepository();
    const row = repo.upsert({
      householdId: "hh_1",
      agentWebhookUrl: "https://agent.example/hooks/cutoff",
      agentWebhookSecretRef: "vault:hh_1_webhook",
      nowUtc: "2026-10-19T12:00:00.000Z",
    });
    expect(row.autoCommitEnabled).toBe(false);
    expect(row.emailEnabled).toBe(true);
    expect(row.agentWebhookSecretRef).toBe("vault:hh_1_webhook");
  });

  it("rejects non-https webhook urls", () => {
    const repo = new MemoryHouseholdNudgeSettingsRepository();
    expect(() =>
      repo.upsert({
        householdId: "hh_1",
        agentWebhookUrl: "http://insecure.example/hook",
        nowUtc: "2026-10-19T12:00:00.000Z",
      }),
    ).toThrow(/https/);
  });

  it("insert is idempotent per line/due/channel", () => {
    const repo = new MemoryReorderNudgeRepository();
    const first = repo.insert({
      householdId: "hh_1",
      lineId: "ll_1",
      dueAt: "2026-10-21T12:00:00.000Z",
      channel: "agent_webhook",
      nowUtc: "2026-10-19T12:00:00.000Z",
    });
    expect(first.ok && first.created).toBe(true);
    const second = repo.insert({
      householdId: "hh_1",
      lineId: "ll_1",
      dueAt: "2026-10-21T12:00:00.000Z",
      channel: "agent_webhook",
      nowUtc: "2026-10-19T12:05:00.000Z",
    });
    expect(second.ok && second.created).toBe(false);
    if (first.ok && second.ok) {
      expect(second.nudge.nudgeId).toBe(first.nudge.nudgeId);
    }
  });

  it("markStatus can resolve acted with order id", () => {
    const repo = new MemoryReorderNudgeRepository();
    const created = repo.insert({
      householdId: "hh_1",
      lineId: "ll_1",
      dueAt: "2026-10-21T12:00:00.000Z",
      channel: "email",
      nowUtc: "2026-10-19T12:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const acted = repo.markStatus(created.nudge.nudgeId, "acted", {
      resolvedOrderId: "ord_1",
    });
    expect(acted?.status).toBe("acted");
    expect(acted?.resolvedOrderId).toBe("ord_1");
  });
});
