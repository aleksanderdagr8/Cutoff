import { describe, expect, it } from "vitest";
import {
  DEFAULT_VELOCITY_CAP_PER_HOUR,
  evaluateRiskGate,
  quoteHashMaterial,
  validateEvidenceFields,
} from "./risk.js";

describe("evaluateRiskGate (U7)", () => {
  const base = {
    killSwitch: false,
    addressId: "addr_home",
    mandateAddressId: "addr_home",
    merchantSuspended: false,
    commitsInLastHour: 0,
  };

  it("passes when all checks clear", () => {
    expect(evaluateRiskGate(base)).toEqual({ ok: true });
  });

  it("kill switch returns kill_switch", () => {
    expect(evaluateRiskGate({ ...base, killSwitch: true })).toEqual({
      ok: false,
      error: "kill_switch",
    });
  });

  it("new address returns mandate_miss", () => {
    expect(
      evaluateRiskGate({ ...base, addressId: "addr_other" }),
    ).toEqual({ ok: false, error: "mandate_miss" });
  });

  it("merchant suspend returns mandate_miss", () => {
    expect(
      evaluateRiskGate({ ...base, merchantSuspended: true }),
    ).toEqual({ ok: false, error: "mandate_miss" });
  });

  it("eleventh commit over velocity cap fails", () => {
    expect(
      evaluateRiskGate({
        ...base,
        commitsInLastHour: DEFAULT_VELOCITY_CAP_PER_HOUR,
      }),
    ).toEqual({ ok: false, error: "mandate_miss" });
  });

  it("tenth commit within cap passes", () => {
    expect(
      evaluateRiskGate({
        ...base,
        commitsInLastHour: DEFAULT_VELOCITY_CAP_PER_HOUR - 1,
      }),
    ).toEqual({ ok: true });
  });

  it("young key below min age fails closed", () => {
    expect(
      evaluateRiskGate({
        ...base,
        keyAgeMs: 100,
        minAgentAgeMs: 1000,
      }),
    ).toEqual({ ok: false, error: "mandate_miss" });
  });
});

describe("validateEvidenceFields (U8)", () => {
  const good = {
    actorChain: ["buyer_agent", "cutoff"],
    protocol: "cutoff.v1",
    agentKeyId: "key_1",
    mandateId: "man_1",
    quoteHash: "qh_1",
    addressId: "addr_home",
    amountCents: 1299,
  };

  it("accepts complete evidence", () => {
    expect(validateEvidenceFields(good)).toEqual({ ok: true });
  });

  it("missing actor chain fails", () => {
    expect(
      validateEvidenceFields({ ...good, actorChain: [] }),
    ).toEqual({ ok: false, error: "mandate_miss" });
  });

  it("missing protocol fails", () => {
    expect(
      validateEvidenceFields({ ...good, protocol: "" }),
    ).toEqual({ ok: false, error: "mandate_miss" });
  });
});

describe("quoteHashMaterial", () => {
  it("is stable for the same quote fields", () => {
    const a = quoteHashMaterial({
      quoteId: "q1",
      landedCents: 100,
      taxCents: 0,
      fulfillerId: "f_a",
      canonicalItemId: "item_1",
      deliveryDateUtc: "2026-10-22",
    });
    const b = quoteHashMaterial({
      quoteId: "q1",
      landedCents: 100,
      taxCents: 0,
      fulfillerId: "f_a",
      canonicalItemId: "item_1",
      deliveryDateUtc: "2026-10-22",
    });
    expect(a).toBe(b);
  });
});

describe("risk gate model import ban (U7)", () => {
  it("this module source has no model client import", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.join(import.meta.dirname, "risk.ts");
    const source = fs.readFileSync(file, "utf8");
    expect(source).not.toMatch(/openai|anthropic|@ai-sdk|langchain/i);
    expect(source).not.toContain("@cutoff/db");
    expect(source).not.toContain("@cutoff/adapters");
    expect(source).not.toMatch(/^import\s/m);
  });
});
