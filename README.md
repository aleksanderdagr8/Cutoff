# Cutoff

Buyer's agent decides when to reorder. Cutoff quotes, commits, and stands behind the bag.

## Layout

```
apps/web          human app (Next.js) — anon key only
apps/api          Cloudflare Worker (Hono)
packages/domain   pure rank / mandate / hold
packages/db       repositories (memory now; Supabase later)
packages/adapters pay, fulfill, tax — fake + live
packages/contracts zod schemas + error codes
```

## Phase 1 (Units 1–3)

Household + member (RLS-shaped), agent credential (hash at rest, revoke → KV), mandate (ceiling, expiry, never-substitute, address). Fake adapters / memory repos — no live Stripe or Supabase required.

```bash
pnpm install
pnpm run test:u0       # Unit 0 + Phase 1 suites (CI)
pnpm run test:phase1   # U1–U3 focused
pnpm run typecheck
pnpm run check:boundaries
```

## Agent auth

`Authorization: Bearer ck_live_…`  
Scopes: `quote`, `commit`, `read_list`. Revoked keys get `{ "error": "revoked" }`.
