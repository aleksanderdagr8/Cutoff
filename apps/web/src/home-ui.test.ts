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

describe("household /home UI hygiene", () => {
  it("client components never persist agent secrets to browser storage", () => {
    const root = join(import.meta.dirname, "components/home");
    const files = walk(root);
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toContain("localStorage");
      expect(src, file).not.toContain("sessionStorage");
    }
  });

  it("mandate client shows secret once and documents no storage", () => {
    const src = readFileSync(
      join(import.meta.dirname, "components/home/mandate-keys-client.tsx"),
      "utf8",
    );
    expect(src).toContain("shown once");
    expect(src).toContain("Never copied into browser storage");
    expect(src).toContain("setIssuedSecret");
    expect(src).toContain("Issue key");
    expect(src).toContain("Revoke");
  });

  it("home routes exist for sign-in, list, mandate, receipt", () => {
    const app = join(import.meta.dirname, "app/home");
    expect(statSync(join(app, "sign-in/page.tsx")).isFile()).toBe(true);
    expect(statSync(join(app, "list/page.tsx")).isFile()).toBe(true);
    expect(statSync(join(app, "mandate/page.tsx")).isFile()).toBe(true);
    expect(statSync(join(app, "receipts/[token]/page.tsx")).isFile()).toBe(
      true,
    );
  });
});
