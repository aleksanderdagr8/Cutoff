import { describe, expect, it } from "vitest";
import {
  applyListLineSkip,
  computeNextDue,
  hasBannedReorderField,
  isDueWithin,
  stickyFulfillerForReorder,
} from "./list.js";

describe("Unit 11 list domain", () => {
  it("rejects sensor / image / weight shaped reorder fields", () => {
    expect(hasBannedReorderField({ sensor: true })).toBe(true);
    expect(hasBannedReorderField({ image: "x" })).toBe(true);
    expect(hasBannedReorderField({ weight: 1 })).toBe(true);
    expect(
      hasBannedReorderField({
        list_line_id: "ll_1",
        qty: 1,
        deliver_by: "2026-10-22",
      }),
    ).toBe(false);
  });

  it("skip pauses the line", () => {
    expect(applyListLineSkip({ paused: false })).toEqual({ paused: true });
  });

  it("reorder never sticks the previous fulfiller", () => {
    expect(stickyFulfillerForReorder("fulfiller_a")).toBeNull();
  });
});

describe("Unit 13 computeNextDue (fixed cadence)", () => {
  it("paused is never due", () => {
    expect(
      computeNextDue({
        paused: true,
        lastOrderedAt: "2026-07-21T12:00:00.000Z",
        cadenceHintDays: 90,
      }),
    ).toEqual({ nextDueAt: null, reason: null });
  });

  it("missing cadence or last order is never due", () => {
    expect(
      computeNextDue({
        paused: false,
        lastOrderedAt: "2026-07-21T12:00:00.000Z",
        cadenceHintDays: null,
      }),
    ).toEqual({ nextDueAt: null, reason: null });
    expect(
      computeNextDue({
        paused: false,
        lastOrderedAt: null,
        cadenceHintDays: 30,
      }),
    ).toEqual({ nextDueAt: null, reason: null });
  });

  it("fixed cadence = last_ordered_at + cadence_hint_days", () => {
    expect(
      computeNextDue({
        paused: false,
        lastOrderedAt: "2026-07-21T12:00:00.000Z",
        cadenceHintDays: 90,
      }),
    ).toEqual({
      nextDueAt: "2026-10-19T12:00:00.000Z",
      reason: "every 90 days, last ordered 2026-07-21",
    });
  });

  it("isDueWithin includes overdue and within window", () => {
    const now = "2026-10-19T12:00:00.000Z";
    expect(isDueWithin("2026-10-19T12:00:00.000Z", now, 0)).toBe(true);
    expect(isDueWithin("2026-10-20T12:00:00.000Z", now, 0)).toBe(false);
    expect(isDueWithin("2026-10-26T12:00:00.000Z", now, 7)).toBe(true);
    expect(isDueWithin("2026-10-27T12:00:00.000Z", now, 7)).toBe(false);
    expect(isDueWithin("2026-10-01T12:00:00.000Z", now, 7)).toBe(true);
    expect(isDueWithin(null, now, 7)).toBe(false);
  });
});
