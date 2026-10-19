import { describe, expect, it } from "vitest";
import { formatCents, formatDueAt } from "./format";

describe("formatDueAt", () => {
  it("formats UTC calendar dates", () => {
    expect(formatDueAt("2026-11-04T00:00:00.000Z")).toBe("Nov 4, 2026");
  });

  it("returns null for missing or invalid", () => {
    expect(formatDueAt(null)).toBeNull();
    expect(formatDueAt(undefined)).toBeNull();
    expect(formatDueAt("not-a-date")).toBeNull();
  });
});

describe("formatCents", () => {
  it("renders USD", () => {
    expect(formatCents(1299)).toBe("$12.99");
  });
});
