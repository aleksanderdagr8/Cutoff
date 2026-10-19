import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * U1: Service role is absent from the browser bundle / web source.
 * Console uses the anon key only (NEXT_PUBLIC_SUPABASE_ANON_KEY).
 */
function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (
      name === "node_modules" ||
      name === ".next" ||
      name === ".open-next" ||
      name === ".wrangler" ||
      name === "dist"
    ) {
      continue;
    }
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path, acc);
    } else if (/\.(ts|tsx|js|mjs|css)$/.test(name)) {
      acc.push(path);
    }
  }
  return acc;
}

describe("U1 browser bundle hygiene", () => {
  it("service role secret name is absent from apps/web source", () => {
    const root = join(import.meta.dirname, "..");
    const files = walk(root);
    const banned = [
      "SUPABASE_SERVICE_ROLE",
      "SERVICE_ROLE_KEY",
      "service_role",
      "serviceRole",
    ];
    for (const file of files) {
      // Allow this test file to mention the banned strings.
      if (file.endsWith("service-role.test.ts")) continue;
      const src = readFileSync(file, "utf8");
      for (const token of banned) {
        expect(src, `${file} must not contain ${token}`).not.toContain(token);
      }
    }
  });
});
