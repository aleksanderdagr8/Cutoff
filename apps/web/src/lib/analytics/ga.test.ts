import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_GA_MEASUREMENT_ID,
  getGaMeasurementId,
  shouldTrackPath,
} from "./ga";

describe("GA measurement id", () => {
  const prev = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    } else {
      process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = prev;
    }
  });

  it("defaults to the production property when unset", () => {
    delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    expect(getGaMeasurementId()).toBe(DEFAULT_GA_MEASUREMENT_ID);
  });

  it("uses an explicit env override", () => {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = "G-TESTONLY123";
    expect(getGaMeasurementId()).toBe("G-TESTONLY123");
  });

  it("disables when env is empty", () => {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = "  ";
    expect(getGaMeasurementId()).toBeNull();
  });
});

describe("GA path coverage", () => {
  it("tracks marketing, home, blog; skips ops", () => {
    expect(shouldTrackPath("/")).toBe(true);
    expect(shouldTrackPath("/home")).toBe(true);
    expect(shouldTrackPath("/home/sign-in")).toBe(true);
    expect(shouldTrackPath("/blog")).toBe(true);
    expect(shouldTrackPath("/docs/why-agents-fail")).toBe(true);
    expect(shouldTrackPath("/ops")).toBe(false);
    expect(shouldTrackPath("/ops/live")).toBe(false);
  });
});
