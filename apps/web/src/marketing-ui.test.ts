import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

describe("marketing `/` hygiene", () => {
  it("root page mounts MarketingPage and keeps product shells separate", () => {
    const page = readFileSync(
      join(import.meta.dirname, "app/page.tsx"),
      "utf8",
    );
    expect(page).toContain("MarketingPage");
    expect(page).not.toContain("/ops");
  });

  it("marketing copy avoids dropped claims and invented pricing", () => {
    const root = join(import.meta.dirname, "components/marketing");
    const files = [
      "marketing-page.tsx",
      "hero-terminal.tsx",
      "builders-panel.tsx",
      "waitlist-form.tsx",
    ];
    const joined = files
      .map((f) => readFileSync(join(root, f), "utf8"))
      .join("\n");
    expect(joined).not.toMatch(/3\.5%/);
    expect(joined).not.toMatch(/\$199/);
    expect(joined).not.toMatch(/Cutoff Spread/i);
    expect(joined).not.toMatch(/Connect Shopify/i);
    expect(joined).not.toMatch(/Protocol Live/i);
    expect(joined).not.toMatch(/virtual card/i);
    expect(joined).toMatch(/coffee/i);
    expect(joined).toMatch(/filter/i);
    expect(joined).toMatch(/towel/i);
    expect(joined).toContain("CUTOFF");
    expect(joined).toContain("/home");
    expect(joined).toMatch(/work for you/i);
    expect(joined).toMatch(/Keep the refill/i);
    expect(joined).toMatch(/household/i);
  });

  it("waitlist stub accepts POST and does not mint API keys", () => {
    const src = readFileSync(
      join(import.meta.dirname, "app/api/waitlist/route.ts"),
      "utf8",
    );
    expect(src).toContain("export async function POST");
    expect(src).toMatch(/lead capture only/i);
    expect(src).not.toMatch(/ck_live_/);
    expect(src).not.toMatch(/api.?key.?generat/i);
  });

  it("marketing components exist", () => {
    const root = join(import.meta.dirname, "components/marketing");
    for (const name of [
      "marketing-page.tsx",
      "hero-terminal.tsx",
      "builders-panel.tsx",
      "waitlist-form.tsx",
    ]) {
      expect(statSync(join(root, name)).isFile()).toBe(true);
    }
  });
});
