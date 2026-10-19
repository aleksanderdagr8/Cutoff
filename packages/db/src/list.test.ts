import { describe, expect, it } from "vitest";
import { MemoryListRepository } from "./list.js";

describe("Unit 14 MemoryListRepository schedule parity", () => {
  it("defaults schedule columns on upsert", () => {
    const repo = new MemoryListRepository();
    const line = repo.upsert({
      householdId: "hh_1",
      mandateId: "m_1",
      canonicalItemId: "item_towels_12",
      cadenceHintDays: 30,
      nowUtc: "2026-10-19T12:00:00.000Z",
    });
    expect(line.cadenceSource).toBe("fixed");
    expect(line.learnedIntervalDays).toBeNull();
    expect(line.lastOrderedAt).toBeNull();
    expect(line.nextDueAt).toBeNull();
    expect(line.snoozedUntil).toBeNull();
    expect(line.leadDays).toBe(3);
  });

  it("recordOrder sets lastOrderedAt and nextDueAt (fixed cadence)", () => {
    const repo = new MemoryListRepository();
    const line = repo.upsert({
      householdId: "hh_1",
      mandateId: "m_1",
      canonicalItemId: "item_towels_12",
      cadenceHintDays: 30,
      nowUtc: "2026-10-01T12:00:00.000Z",
    });
    repo.recordOrder(line.lineId, "ord_1", "2026-10-19T12:00:00.000Z");
    const updated = repo.get(line.lineId)!;
    expect(updated.lastOrderId).toBe("ord_1");
    expect(updated.lastOrderedAt).toBe("2026-10-19T12:00:00.000Z");
    expect(updated.nextDueAt).toBe("2026-11-18T12:00:00.000Z");
    expect(updated.paused).toBe(false);
  });

  it("skip clears nextDueAt via paused", () => {
    const repo = new MemoryListRepository();
    const line = repo.upsert({
      householdId: "hh_1",
      mandateId: "m_1",
      canonicalItemId: "item_towels_12",
      cadenceHintDays: 30,
      nowUtc: "2026-10-01T12:00:00.000Z",
    });
    repo.recordOrder(line.lineId, "ord_1", "2026-10-19T12:00:00.000Z");
    repo.skip(line.lineId);
    const updated = repo.get(line.lineId)!;
    expect(updated.paused).toBe(true);
    expect(updated.nextDueAt).toBeNull();
  });

  it("applySkip next and snooze", () => {
    const repo = new MemoryListRepository();
    const line = repo.upsert({
      householdId: "hh_1",
      mandateId: "m_1",
      canonicalItemId: "item_towels_12",
      cadenceHintDays: 30,
      nowUtc: "2026-10-01T12:00:00.000Z",
    });
    repo.recordOrder(line.lineId, "ord_1", "2026-09-21T12:00:00.000Z");
    const next = repo.applySkip({
      lineId: line.lineId,
      mode: "next",
      nowUtc: "2026-10-19T12:00:00.000Z",
    });
    expect(next.ok && next.line.nextDueAt).toBe("2026-11-20T12:00:00.000Z");
    const snooze = repo.applySkip({
      lineId: line.lineId,
      mode: "snooze",
      until: "2026-10-26T12:00:00.000Z",
      nowUtc: "2026-10-19T12:00:00.000Z",
    });
    expect(snooze.ok && snooze.line.snoozedUntil).toBe(
      "2026-10-26T12:00:00.000Z",
    );
  });
});
