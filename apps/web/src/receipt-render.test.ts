import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Unit 10: receipt page shows item, landed, fulfiller, why-this-seller, skip.
 * No retention interstitial copy.
 */
describe("U10 receipt console page", () => {
  const pageSrc = readFileSync(
    join(import.meta.dirname, "app/home/receipts/[token]/page.tsx"),
    "utf8",
  );
  const actionsSrc = readFileSync(
    join(import.meta.dirname, "components/home/receipt-actions.tsx"),
    "utf8",
  );

  it("renders why-this-seller rank inputs and skip without retention", () => {
    expect(pageSrc).toContain("why_this_seller");
    expect(pageSrc).toContain("landed_cents");
    expect(pageSrc).toContain("fulfiller_id");
    expect(actionsSrc).toContain("Skip");
    expect(pageSrc.toLowerCase()).not.toContain("are you sure");
    expect(pageSrc.toLowerCase()).not.toContain("stay subscribed");
    expect(pageSrc.toLowerCase()).not.toContain("retention");
    expect(actionsSrc.toLowerCase()).not.toContain("are you sure");
  });

  it("does not require an agent credential in the page", () => {
    expect(pageSrc).not.toContain("ck_live_");
    expect(pageSrc).not.toContain("Authorization");
    expect(pageSrc).toContain("revoked");
  });
});
