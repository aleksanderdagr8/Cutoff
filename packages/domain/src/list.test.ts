import { describe, expect, it } from "vitest";
import {
  applyListLineSkip,
  hasBannedReorderField,
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
