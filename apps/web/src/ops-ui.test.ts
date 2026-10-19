import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "dist") {
      continue;
    }
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path, acc);
    } else if (/\.(ts|tsx)$/.test(name)) {
      acc.push(path);
    }
  }
  return acc;
}

describe("operator /ops UI hygiene", () => {
  it("client components never persist secrets to browser storage", () => {
    const root = join(import.meta.dirname, "components/ops");
    const files = walk(root);
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toContain("localStorage");
      expect(src, file).not.toContain("sessionStorage");
    }
  });

  it("ops routes exist for live, order sheet, secondary index, sign-in", () => {
    const app = join(import.meta.dirname, "app/ops");
    expect(statSync(join(app, "sign-in/page.tsx")).isFile()).toBe(true);
    expect(statSync(join(app, "live/page.tsx")).isFile()).toBe(true);
    expect(statSync(join(app, "orders/[orderId]/page.tsx")).isFile()).toBe(
      true,
    );
    expect(statSync(join(app, "households/page.tsx")).isFile()).toBe(true);
    expect(statSync(join(app, "mandates/page.tsx")).isFile()).toBe(true);
    expect(statSync(join(app, "fulfillers/page.tsx")).isFile()).toBe(true);
    expect(statSync(join(app, "audit/page.tsx")).isFile()).toBe(true);
  });

  it("order sheet requires reason + audit language", () => {
    const src = readFileSync(
      join(import.meta.dirname, "components/ops/order-sheet-client.tsx"),
      "utf8",
    );
    expect(src).toContain("reason");
    expect(src).toContain("audit");
    expect(src).toMatch(/cannot\s+raise\s+a\s+ceiling/);
  });

  it("shell is operator-scoped, elevated, and separate from household", () => {
    const src = readFileSync(
      join(import.meta.dirname, "components/ops/shell.tsx"),
      "utf8",
    );
    expect(src).toContain("Ops");
    expect(src).toContain("ops-bottom-nav");
    expect(src).toContain("ops-atmosphere");
    expect(src).toContain("font-display");
    expect(src).toContain("/ops/live");
    expect(src).toContain("/ops/households");
    expect(src).toContain("/ops/mandates");
    expect(src).toContain("/ops/fulfillers");
    expect(src).toContain("/ops/audit");
    expect(src).not.toContain("/home/list");
    expect(src).not.toContain("/home");
    expect(src).not.toMatch(/>\s*Household\s*</);
  });

  it("live client polls and exposes honest empty copy", () => {
    const src = readFileSync(
      join(import.meta.dirname, "components/ops/live-client.tsx"),
      "utf8",
    );
    expect(src).toContain("/api/ops/live");
    expect(src).toContain("setInterval");
    expect(src).toContain("No order events yet");
    expect(src).toContain("Needs attention");
  });
});
