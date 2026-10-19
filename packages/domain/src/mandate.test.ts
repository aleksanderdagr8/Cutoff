import { describe, expect, it } from "vitest";
import {
  agentMandateWidenDenied,
  applyLowerCeiling,
  checkMandate,
  checkMandateForCommit,
  FORBIDDEN_SCOPES,
  hasScope,
  scopesAreValid,
} from "./mandate.js";

const baseMandate = {
  ceilingCents: 2000,
  expiresAtUtc: "2026-12-01T00:00:00.000Z",
  canonicalItemIds: ["item_towels_12"],
  categoryAllowList: [] as string[],
  neverSubstituteIds: ["item_towels_12"],
  addressId: "addr_home",
  actorCap: 4,
};

describe("checkMandate", () => {
  it("passes when item, address, ceiling, and expiry are ok", () => {
    const result = checkMandate({
      mandate: baseMandate,
      canonicalItemId: "item_towels_12",
      amountCents: 1299,
      addressId: "addr_home",
      nowUtc: "2026-10-19T00:00:00.000Z",
    });
    expect(result).toEqual({ ok: true });
  });

  it("fails closed on expired mandate", () => {
    const result = checkMandate({
      mandate: baseMandate,
      canonicalItemId: "item_towels_12",
      amountCents: 100,
      addressId: "addr_home",
      nowUtc: "2026-12-01T00:00:00.000Z",
    });
    expect(result).toEqual({ ok: false, error: "mandate_miss" });
  });

  it("rejects unknown address", () => {
    const result = checkMandate({
      mandate: baseMandate,
      canonicalItemId: "item_towels_12",
      amountCents: 100,
      addressId: "addr_other",
      nowUtc: "2026-10-19T00:00:00.000Z",
    });
    expect(result).toEqual({ ok: false, error: "mandate_miss" });
  });

  it("returns over_ceiling when amount exceeds ceiling", () => {
    const result = checkMandate({
      mandate: baseMandate,
      canonicalItemId: "item_towels_12",
      amountCents: 2001,
      addressId: "addr_home",
      nowUtc: "2026-10-19T00:00:00.000Z",
    });
    expect(result).toEqual({ ok: false, error: "over_ceiling" });
  });
});

describe("checkMandateForCommit", () => {
  it("maps over ceiling to mandate_miss", () => {
    const result = checkMandateForCommit({
      mandate: baseMandate,
      canonicalItemId: "item_towels_12",
      amountCents: 5000,
      addressId: "addr_home",
      nowUtc: "2026-10-19T00:00:00.000Z",
    });
    expect(result).toEqual({ ok: false, error: "mandate_miss" });
  });
});

describe("agentMandateWidenDenied", () => {
  it("blocks raise ceiling and add address", () => {
    expect(agentMandateWidenDenied({ raiseCeiling: true })).toBe("mandate_miss");
    expect(agentMandateWidenDenied({ newCeilingCents: 9999 })).toBe(
      "mandate_miss",
    );
    expect(agentMandateWidenDenied({ addAddress: true })).toBe("mandate_miss");
    expect(agentMandateWidenDenied({ newAddressId: "addr_2" })).toBe(
      "mandate_miss",
    );
    expect(agentMandateWidenDenied({})).toBeNull();
  });
});

describe("applyLowerCeiling", () => {
  it("allows lower or equal; rejects raise", () => {
    expect(applyLowerCeiling(2000, 1500)).toBe(1500);
    expect(applyLowerCeiling(2000, 2000)).toBe(2000);
    expect(applyLowerCeiling(2000, 2001)).toBeNull();
  });
});

describe("scopes", () => {
  it("allows quote/commit/read_list and forbids raise_cap/new_address", () => {
    expect(scopesAreValid(["quote", "commit"])).toBe(true);
    expect(scopesAreValid(["read_list"])).toBe(true);
    expect(scopesAreValid(["raise_cap"])).toBe(false);
    expect(scopesAreValid(["new_address"])).toBe(false);
    expect(FORBIDDEN_SCOPES).toContain("raise_cap");
    expect(hasScope(["quote", "commit"], "quote")).toBe(true);
    expect(hasScope(["quote"], "commit")).toBe(false);
  });
});
