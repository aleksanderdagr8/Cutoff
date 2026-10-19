/** Shared rules for the Unit 0 module boundary check. */

export function importsForeignTables(source: string, pkg: string): boolean {
  if (pkg === "packages/db") return false;
  if (/@cutoff\/db\/tables/.test(source)) return true;
  if (/packages\/db\/src\/tables/.test(source)) return true;
  if (
    /from\s+["'][^"']*\/tables(?:\.js)?["']/.test(source) &&
    /MODULE_TABLES|canonical_items|order_events/.test(source)
  ) {
    return true;
  }
  return false;
}

export function domainPurityViolations(source: string): string[] {
  const banned = [
    "@cutoff/db",
    "@cutoff/adapters",
    "@supabase/",
    "stripe",
    "hono",
    "node:fs",
    "node:net",
    "node:http",
  ];
  return banned.filter((b) => source.includes(b));
}

export function usesSupabaseOutsideDb(source: string, pkg: string): boolean {
  // Repository clients live in packages/db. apps/web may use @supabase/*
  // for household Auth (anon key + user JWT only — never service_role).
  if (pkg === "packages/db" || pkg === "apps/web") return false;
  return (
    /from\s+["']@supabase\//.test(source) ||
    /require\(["']@supabase\//.test(source)
  );
}

export function commitImportsFulfill(source: string, rel: string): boolean {
  if (!rel.includes("handlers/fake-commit") && !rel.includes("handlers/commit")) {
    return false;
  }
  return /FakeFulfillAdapter/.test(source);
}
