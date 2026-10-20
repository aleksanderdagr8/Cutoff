# Threat notes — Phase 1

What the agent is allowed to do in this build (and what it is not).

## Allowed

- Call quote and commit with a scoped agent key (`ck_live_…`) over HTTPS.
- Act only on mandates named at key issue. Scopes: `quote`, `commit`, `read_list`.
- Read its own household id mapping. Cross-household reads fail closed.

## Not allowed

- Open merchant, bank, or warehouse accounts.
- Raise a spend ceiling or add an address (`POST /v1/mandates/:id/widen` → `mandate_miss`).
- Use scopes `raise_cap` or `new_address` (rejected at issue).
- Send camera, pantry, weight, sensor, or card (PAN) data — rejected at the edge.
- Read another household's data.
- Use a revoked key (KV cache, Postgres fallback → `revoked`).
- Mutate ledger history; status is append-only events.
- Bypass adapters to talk to Stripe or a fulfiller SDK directly.
- Hold customer funds on Cutoff's books.
- See or recover the agent secret after issue (hash at rest only).

## Phase 1 surface

- `GET /health` — public liveness (`phase: "2"`).
- `POST /v1/households` — human/console (service-role worker).
- `GET /v1/households/:id` — member session headers or agent Bearer (own household only).
- `POST /v1/households/:id/mandates` — create mandate.
- `PATCH /v1/households/:id/mandates/:mid` — human lowers ceiling only.
- `POST /v1/households/:id/agents` — issue key; secret once.
- `POST /v1/households/:id/agents/:keyId/revoke` — revoke + KV fan-out.
- `POST /v1/quotes` — agent Bearer; mandate + ceiling check (stub amount until catalog).
- `POST /v1/commits` — agent Bearer; mandate re-check; fake pay; idempotent.
- `POST /v1/_phase0/commits` — local/CI idempotency proof only. Production (`CUTOFF_ENV=production`) responds 404.

## Trust

- Browser / `apps/web`: anon key + RLS only. Service role must never appear in the web bundle.
- Worker: service role for human console writes. Agent path uses hashed credentials, not Supabase Auth users.
