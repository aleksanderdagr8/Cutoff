/**
 * Unit 0 dependency check: a module must not import another module's tables.
 * Also enforces: domain has no I/O imports; Supabase data clients under
 * packages/db (apps/web may import @supabase/* for Auth session only).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  commitImportsFulfill,
  domainPurityViolations,
  importsForeignTables,
  usesSupabaseOutsideDb,
} from "./boundaries-lib.js";

const root = join(import.meta.dirname, "..");
const failures: string[] = [];

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (
      name === "node_modules" ||
      name === "dist" ||
      name === ".next" ||
      name === ".git"
    ) {
      continue;
    }
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path, acc);
    } else if (/\.(ts|tsx|js|mjs)$/.test(name) && !name.endsWith(".test.ts")) {
      acc.push(path);
    }
  }
  return acc;
}

function packageOf(file: string): string | null {
  const rel = relative(root, file).replace(/\\/g, "/");
  const m = rel.match(/^(packages|apps)\/([^/]+)/);
  return m ? `${m[1]}/${m[2]}` : null;
}

function checkFile(file: string): void {
  const pkg = packageOf(file);
  if (!pkg) return;
  const src = readFileSync(file, "utf8");
  const rel = relative(root, file).replace(/\\/g, "/");

  if (importsForeignTables(src, pkg)) {
    failures.push(
      `${rel}: imports another module's tables (forbidden cross-module table read)`,
    );
  }

  if (pkg === "packages/domain") {
    for (const ban of domainPurityViolations(src)) {
      failures.push(`${rel}: domain must stay pure; found "${ban}"`);
    }
  }

  if (usesSupabaseOutsideDb(src, pkg)) {
    failures.push(
      `${rel}: Supabase client is only allowed inside packages/db`,
    );
  }

  if (commitImportsFulfill(src, rel)) {
    failures.push(
      `${rel}: commit handler must not import fulfill adapter directly`,
    );
  }
}

const files = walk(join(root, "packages")).concat(walk(join(root, "apps")));
for (const file of files) {
  checkFile(file);
}

if (failures.length > 0) {
  console.error(
    "Boundary check failed:\n" + failures.map((f) => ` - ${f}`).join("\n"),
  );
  process.exit(1);
}

console.log(`Boundary check passed (${files.length} files).`);
