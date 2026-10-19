import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Unit 10: receipt page shows item, landed, fulfiller, why-this-seller, skip.
 * No retention interstitial copy.
 */
describe("U10 receipt console page", () => {
  const src = readFileSync(
    join(import.meta.dirname, "app/home/receipts/[token]/page.tsx"),
    "utf8",
  );

  it("renders why-this-seller rank inputs and skip without retention", () => {
    expect(src).toContain("why_this_seller");
    expect(src).toContain("landed_cents");
    expect(src).toContain("fulfiller_id");
    expect(src).toContain("Skip");
    expect(src.toLowerCase()).not.toContain("are you sure");
    expect(src.toLowerCase()).not.toContain("stay subscribed");
    expect(src.toLowerCase()).not.toContain("retention");
  });

  it("does not require an agent credential in the page", () => {
    expect(src).not.toContain("ck_live_");
    expect(src).not.toContain("Authorization");
    expect(src).toContain("revoked");
  });
});
