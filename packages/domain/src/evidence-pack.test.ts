import { describe, expect, it } from "vitest";
import { assembleEvidencePack } from "./index.js";

describe("assembleEvidencePack", () => {
  it("exports actor chain, quote hash, amount, fulfiller, rank inputs", () => {
    const result = assembleEvidencePack({
      orderId: "ord_1",
      evidenceId: "ev_1",
      actorChain: ["buyer_agent", "cutoff"],
      protocol: "cutoff.v1",
      agentKeyId: "key_1",
      mandateId: "man_1",
      quoteHash: "abc123hash",
      addressId: "addr_home",
      amountCents: 1299,
      fulfillerId: "fulfiller_b",
      quoteId: "q_1",
      canonicalItemId: "item_towels_12",
      rankInputs: {
        landedCents: 1299,
        deliveryDateUtc: "2026-10-21",
        merchantScore: 1,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.actorChain).toEqual(["buyer_agent", "cutoff"]);
    expect(result.pack.quoteHash).toBe("abc123hash");
    expect(result.pack.amountCents).toBe(1299);
    expect(result.pack.fulfillerId).toBe("fulfiller_b");
    expect(result.pack.rankInputs).toEqual({
      landedCents: 1299,
      deliveryDateUtc: "2026-10-21",
      merchantScore: 1,
    });
  });

  it("rejects empty actor chain", () => {
    const result = assembleEvidencePack({
      orderId: "ord_1",
      evidenceId: "ev_1",
      actorChain: [],
      protocol: "cutoff.v1",
      agentKeyId: "key_1",
      mandateId: "man_1",
      quoteHash: "h",
      addressId: "addr_home",
      amountCents: 100,
      fulfillerId: "fulfiller_a",
      quoteId: "q_1",
      canonicalItemId: "item_towels_12",
      rankInputs: {
        landedCents: 100,
        deliveryDateUtc: "2026-10-21",
        merchantScore: 0,
      },
    });
    expect(result).toEqual({ ok: false, error: "mandate_miss" });
  });
});
