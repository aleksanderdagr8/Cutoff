# Cutoff

Buyer's agent decides when to reorder. Cutoff quotes, commits, and stands behind the bag.

## Layout

```
apps/web          human app (Next.js) — anon key only
apps/api          Cloudflare Worker (Hono)
packages/domain   pure rank / mandate / hold / catalog / quote / risk
packages/db       repositories (memory now; Supabase later)
packages/adapters pay, fulfill, tax, offer feed — fake + live
packages/contracts zod schemas + error codes
```

## Phase 3 (Units 7–8)

Risk gate (kill switch, address, velocity) + evidenced commit + fake pay. No live Stripe required for CI exit.

```bash
pnpm install
pnpm run test:u0       # Unit 0 + Phase 1–3 suites (CI)
pnpm run test:phase3   # same as test:u0
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

## Commit

`POST /v1/commits` with `quote_id`, `actor_chain`, `protocol` + `Idempotency-Key`.  
Risk gate runs first. Charge amount is always the quote landed cents.
