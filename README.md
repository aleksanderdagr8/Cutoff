# Cutoff

Buyer's agent decides when to reorder. Cutoff quotes, commits, and stands behind the bag.

## Layout

```
apps/web          human app (Next.js) — anon key only
apps/api          Cloudflare Worker (Hono)
packages/domain   pure rank / mandate / hold / catalog / quote select
packages/db       repositories (memory now; Supabase later)
packages/adapters pay, fulfill, tax, offer feed — fake + live
packages/contracts zod schemas + error codes
```

## Phase 2 (Units 4–6)

Canonical catalog, offer ingest with freshness, immutable ranked quote. Fake adapters / memory repos — no live Stripe or Supabase required.

```bash
pnpm install
pnpm run test:u0       # Unit 0 + Phase 1 + Phase 2 suites (CI)
pnpm run test:phase2   # same as test:u0
pnpm run typecheck
pnpm run check:boundaries
```

## Agent auth

`Authorization: Bearer ck_live_…`  
Scopes: `quote`, `commit`, `read_list`. Revoked keys get `{ "error": "revoked" }`.

## Quote

`POST /v1/quotes` with `mandate_id`, `canonical_item_id`, `qty`, `deliver_by`.  
Rank: lower landed → earlier delivery → higher merchant score.  
Typed errors include `stale_offer`, `hold_active`, `out_of_stock`, `over_ceiling`, `mandate_miss`, `quote_expired`.
