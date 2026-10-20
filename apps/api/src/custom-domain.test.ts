import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("cutoff-api custom domain", () => {
  it("wrangler.toml serves api.callcutoff.com and keeps workers.dev", () => {
    const toml = readFileSync(
      join(import.meta.dirname, "../wrangler.toml"),
      "utf8",
    );
    expect(toml).toMatch(/workers_dev\s*=\s*true/);
    expect(toml).toMatch(/pattern\s*=\s*"api\.callcutoff\.com"/);
    expect(toml).toMatch(/custom_domain\s*=\s*true/);
  });
});
