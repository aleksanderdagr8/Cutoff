# Threat notes — Phase 0

What the agent is allowed to do in this build (and what it is not).

## Allowed (later units; interfaces only in Phase 0)

- Call quote and commit with a scoped agent key over HTTPS.
- Read its household list when the key has `read_list`.
- Skip a list line when the mandate allows cancel.
- Receive signed outbound webhooks for order lifecycle events.

## Not allowed

- Open merchant, bank, or warehouse accounts.
- Raise a spend ceiling or add an address.
- Send camera, pantry, weight, sensor, or card (PAN) data — rejected at the edge.
- Read another household's data.
- Mutate ledger history; status is append-only events.
- Bypass adapters to talk to Stripe or a fulfiller SDK directly.
- Hold customer funds on Cutoff's books.

## Phase 0 surface

- `GET /health` — public liveness.
- `POST /v1/_phase0/commits` — fake commit against in-memory store and fake pay. Not production auth. Exists only to prove idempotency (same key → one row).

Production `/v1/*` auth, risk gate, and live adapters arrive in Phases 1–4.
