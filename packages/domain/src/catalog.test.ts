import { describe, expect, it } from "vitest";
import {
  isExcludedByRecall,
  unitPriceCents,
  validateDescription,
} from "./catalog.js";

describe("validateDescription", () => {
  it("accepts plain text", () => {
    expect(validateDescription("Soft paper towels, 12 rolls")).toEqual({
      ok: true,
      description: "Soft paper towels, 12 rolls",
    });
  });

  it("rejects markup with <", () => {
    expect(validateDescription("Soft <b>towels</b>")).toEqual({
      ok: false,
      reason: "markup",
    });
  });

  it("rejects URLs", () => {
    expect(validateDescription("See https://example.com/towels")).toEqual({
      ok: false,
      reason: "url",
    });
    expect(validateDescription("Visit www.example.com")).toEqual({
      ok: false,
      reason: "url",
    });
  });
});

describe("unitPriceCents", () => {
  it("is landed / pack_count", () => {
    expect(unitPriceCents(1299, 12)).toBe(108);
    expect(unitPriceCents(1200, 6)).toBe(200);
  });
});

describe("isExcludedByRecall", () => {
  it("excludes recalled items", () => {
    expect(isExcludedByRecall(true)).toBe(true);
    expect(isExcludedByRecall(false)).toBe(false);
  });
});
