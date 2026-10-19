import { describe, expect, it, afterEach } from "vitest";
import { writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { importsForeignTables, mcpImportsDb } from "./boundaries-lib.js";

const root = join(import.meta.dirname, "..");
const probeDir = join(root, "packages/domain/src/__boundary_probe__");
const probeFile = join(probeDir, "bad-import.ts");

afterEach(() => {
  if (existsSync(probeDir)) {
    rmSync(probeDir, { recursive: true, force: true });
  }
});

describe("U0 module boundary check", () => {
  it("passes on the current tree", () => {
    const out = execFileSync(
      "pnpm",
      ["exec", "tsx", "scripts/check-boundaries.ts"],
      { cwd: root, encoding: "utf8" },
    );
    expect(out).toContain("Boundary check passed");
  });

  it("rejects apps/mcp importing @cutoff/db", () => {
    expect(
      mcpImportsDb('import { something } from "@cutoff/db";', "apps/mcp"),
    ).toBe(true);
    expect(mcpImportsDb('import { something } from "@cutoff/db";', "apps/api")).toBe(
      false,
    );
  });

  it("rejects a module import of another module's tables", () => {
    expect(
      importsForeignTables(
        'export { MODULE_TABLES } from "@cutoff/db/tables";',
        "packages/domain",
      ),
    ).toBe(true);

    mkdirSync(probeDir, { recursive: true });
    writeFileSync(
      probeFile,
      'export { MODULE_TABLES } from "@cutoff/db/tables";\n',
      "utf8",
    );

    let failed = false;
    try {
      execFileSync("pnpm", ["exec", "tsx", "scripts/check-boundaries.ts"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      failed = true;
      const e = err as { stderr?: Buffer | string; stdout?: Buffer | string };
      const msg = `${e.stderr?.toString() ?? ""}${e.stdout?.toString() ?? ""}`;
      expect(msg).toMatch(/another module's tables|Boundary check failed/);
    }
    expect(failed).toBe(true);
  });
});
