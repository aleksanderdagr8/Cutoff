-- Cutoff initial durable schema (framework §4 + packages/db MODULE_TABLES).
-- Not wired live yet: apply when the dedicated Cutoff Supabase project exists.
-- Ids are text ULIDs. Money is integer cents. Timestamps are timestamptz (UTC).
-- No PAN column. No placement / preferred columns on quotes or offers.

-- ---------------------------------------------------------------------------
-- Principal
-- ---------------------------------------------------------------------------

create table public.principals (
  principal_id text primary key,
  email text not null unique,
  created_at timestamptz not null default now()
);

create table public.households (
  household_id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.members (
  member_id text primary key,
  household_id text not null references public.households (household_id),
  email text not null,
  -- Set when Supabase Auth is wired; used by RLS helpers.
  auth_user_id uuid unique references auth.users (id),
  created_at timestamptz not null default now()
);

create index members_household_id_idx on public.members (household_id);
create index members_auth_user_id_idx on public.members (auth_user_id);

-- ---------------------------------------------------------------------------
-- Agent credential (hash only; secret never stored)
-- ---------------------------------------------------------------------------

create table public.agent_credentials (
  key_id text primary key,
  household_id text not null references public.households (household_id),
  secret_hash text not null unique,
  scopes text[] not null
    check (
      scopes <@ array['quote', 'commit', 'read_list']::text[]
      and cardinality(scopes) > 0
    ),
  mandate_ids text[] not null default '{}',
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index agent_credentials_household_id_idx
  on public.agent_credentials (household_id);

-- Append-only revoke audit / KV rebuild source (framework: revocations).
create table public.revocations (
  key_id text primary key references public.agent_credentials (key_id),
  revoked_at timestamptz not null default now(),
  actor_id text
);

-- ---------------------------------------------------------------------------
-- Mandate
-- ---------------------------------------------------------------------------

create table public.mandates (
  mandate_id text primary key,
  household_id text not null references public.households (household_id),
  ceiling_cents integer not null check (ceiling_cents >= 0),
  expires_at_utc timestamptz not null,
  address_id text not null,
  actor_cap integer not null default 4 check (actor_cap >= 1),
  allow_cancel boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index mandates_household_id_idx on public.mandates (household_id);

-- Normalized allow / never-substitute lines (MODULE_TABLES.mandate).
create table public.mandate_lines (
  line_id text primary key,
  mandate_id text not null references public.mandates (mandate_id) on delete cascade,
  kind text not null
    check (kind in ('canonical_item', 'category_allow', 'never_substitute')),
  value text not null,
  unique (mandate_id, kind, value)
);

create index mandate_lines_mandate_id_idx on public.mandate_lines (mandate_id);

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create table public.canonical_items (
  canonical_item_id text primary key,
  gtin text not null,
  pack_count integer not null check (pack_count >= 1),
  unit text not null check (unit in ('roll', 'oz', 'lb', 'each')),
  category text not null,
  description text not null,
  allergen_flags text[] not null default '{}',
  formula_flags text[] not null default '{}',
  recalled boolean not null default false,
  brand text not null,
  created_at timestamptz not null default now(),
  unique (gtin, pack_count)
);

create table public.equivalences (
  equivalence_id text primary key,
  from_canonical_item_id text not null
    references public.canonical_items (canonical_item_id),
  to_canonical_item_id text not null
    references public.canonical_items (canonical_item_id),
  check (from_canonical_item_id <> to_canonical_item_id),
  unique (from_canonical_item_id, to_canonical_item_id)
);

-- ---------------------------------------------------------------------------
-- Offer
-- ---------------------------------------------------------------------------

create table public.offers (
  offer_id text primary key,
  canonical_item_id text not null
    references public.canonical_items (canonical_item_id),
  fulfiller_id text not null,
  source_id text not null,
  external_sku text not null,
  price_cents integer not null check (price_cents >= 0),
  tax_cents integer not null check (tax_cents >= 0),
  delivery_date_utc timestamptz not null,
  fresh_until_utc timestamptz not null,
  in_stock boolean not null default true,
  merchant_score numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (fulfiller_id, canonical_item_id)
);

create index offers_canonical_item_id_idx on public.offers (canonical_item_id);
create index offers_fresh_until_utc_idx on public.offers (fresh_until_utc);

-- Adapter failure marks source down without deleting last good offer.
create table public.offer_sources (
  source_id text primary key,
  down boolean not null default false,
  last_error_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Quote (immutable once issued; no placement column)
-- ---------------------------------------------------------------------------

create table public.quotes (
  quote_id text primary key,
  household_id text not null references public.households (household_id),
  mandate_id text not null references public.mandates (mandate_id),
  agent_key_id text not null references public.agent_credentials (key_id),
  canonical_item_id text not null
    references public.canonical_items (canonical_item_id),
  qty integer not null check (qty >= 1),
  landed_cents integer not null check (landed_cents >= 0),
  tax_cents integer not null check (tax_cents >= 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  delivery_date_utc timestamptz not null,
  fulfiller_id text not null,
  offer_id text not null references public.offers (offer_id),
  score_inputs jsonb not null,
  address_id text not null,
  ceiling_cents integer not null check (ceiling_cents >= 0),
  expires_at_utc timestamptz not null,
  created_at timestamptz not null,
  committed_at_utc timestamptz,
  substitute jsonb
);

create index quotes_household_id_idx on public.quotes (household_id);

-- Hold: one open quote / in-flight commit per (household, canonical item).
create table public.quote_holds (
  household_id text not null references public.households (household_id),
  canonical_item_id text not null
    references public.canonical_items (canonical_item_id),
  quote_id text not null references public.quotes (quote_id),
  primary key (household_id, canonical_item_id)
);

-- ---------------------------------------------------------------------------
-- Commit / ledger / pay edge
-- ---------------------------------------------------------------------------

create table public.orders (
  order_id text primary key,
  household_id text not null references public.households (household_id),
  canonical_item_id text not null
    references public.canonical_items (canonical_item_id),
  quote_id text not null references public.quotes (quote_id),
  amount_cents integer not null check (amount_cents >= 0),
  charge_id text,
  idempotency_key text not null,
  status text not null
    check (
      status in (
        'committed',
        'captured',
        'failed',
        'placed',
        'shipped',
        'delivered',
        'refunded'
      )
    ),
  created_at timestamptz not null default now(),
  unique (household_id, idempotency_key)
);

create index orders_household_id_idx on public.orders (household_id);

-- Explicit edge lock table (MODULE_TABLES.edge); mirrors orders unique.
create table public.idempotency_keys (
  household_id text not null references public.households (household_id),
  idempotency_key text not null,
  order_id text not null references public.orders (order_id),
  created_at timestamptz not null default now(),
  primary key (household_id, idempotency_key)
);

-- Append-only ledger. Status is a new event; do not update past rows.
create table public.order_events (
  event_id text primary key,
  order_id text not null references public.orders (order_id),
  status text not null
    check (
      status in (
        'committed',
        'captured',
        'failed',
        'placed',
        'shipped',
        'delivered',
        'refunded'
      )
    ),
  at_utc timestamptz not null
);

create index order_events_order_id_idx on public.order_events (order_id);

create table public.evidence (
  evidence_id text primary key,
  order_id text not null unique references public.orders (order_id),
  actor_chain text[] not null,
  protocol text not null,
  agent_key_id text not null references public.agent_credentials (key_id),
  mandate_id text not null references public.mandates (mandate_id),
  quote_hash text not null,
  address_id text not null,
  amount_cents integer not null check (amount_cents >= 0),
  created_at timestamptz not null default now(),
  check (cardinality(actor_chain) > 0)
);

create table public.charges (
  charge_id text primary key,
  order_id text not null references public.orders (order_id),
  amount_cents integer not null check (amount_cents >= 0),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (order_id)
);

create table public.refunds (
  refund_id text primary key,
  order_id text not null references public.orders (order_id),
  amount_cents integer not null check (amount_cents >= 0),
  reason text not null
    check (reason in ('place_failed', 'cancel_before_ship', 'human', 'risk')),
  status text not null default 'queued'
    check (status in ('queued', 'completed')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Fulfill
-- ---------------------------------------------------------------------------

create table public.fulfillment_jobs (
  job_id text primary key,
  order_id text not null unique references public.orders (order_id),
  household_id text not null references public.households (household_id),
  fulfiller_id text not null,
  status text not null
    check (status in ('accepted', 'cancelled', 'failed')),
  created_at timestamptz not null default now()
);

create table public.shipment_events (
  id text primary key,
  external_event_id text not null unique,
  order_id text not null references public.orders (order_id),
  job_id text not null references public.fulfillment_jobs (job_id),
  status text not null
    check (
      status in ('shipped', 'delivered', 'cancelled', 'tracking_update')
    ),
  tracking_number text,
  at_utc timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.return_requests (
  return_id text primary key,
  order_id text not null references public.orders (order_id),
  household_id text not null references public.households (household_id),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Risk
-- ---------------------------------------------------------------------------

create table public.merchant_score_events (
  event_id text primary key,
  fulfiller_id text not null,
  kind text not null
    check (kind in ('on_time', 'late', 'cancel', 'refund')),
  order_id text references public.orders (order_id),
  at_utc timestamptz not null,
  actor_id text not null
);

create index merchant_score_events_fulfiller_id_idx
  on public.merchant_score_events (fulfiller_id);

-- Materialized from events (risk module).
create table public.merchant_scores (
  fulfiller_id text primary key,
  score numeric not null default 0,
  updated_at timestamptz not null default now()
);

create table public.risk_audits (
  audit_id text primary key,
  action text not null
    check (
      action in (
        'kill_switch_on',
        'kill_switch_off',
        'merchant_suspend',
        'merchant_resume'
      )
    ),
  actor_id text not null,
  target_id text,
  at_utc timestamptz not null
);

create table public.risk_flags (
  flag_key text primary key,
  value boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.risk_flags (flag_key, value)
values ('kill_switch', false);

create table public.suspended_merchants (
  fulfiller_id text primary key,
  suspended_at timestamptz not null default now(),
  actor_id text not null
);

-- ---------------------------------------------------------------------------
-- Receipt + list (household console)
-- ---------------------------------------------------------------------------

create table public.receipts (
  receipt_token text primary key,
  order_id text not null unique references public.orders (order_id),
  household_id text not null references public.households (household_id),
  created_at timestamptz not null default now()
);

create index receipts_household_id_idx on public.receipts (household_id);

create table public.list_lines (
  line_id text primary key,
  household_id text not null references public.households (household_id),
  mandate_id text not null references public.mandates (mandate_id),
  canonical_item_id text not null
    references public.canonical_items (canonical_item_id),
  cadence_hint_days integer check (
    cadence_hint_days is null or cadence_hint_days >= 1
  ),
  never_substitute boolean not null default false,
  last_quote_id text references public.quotes (quote_id),
  last_order_id text references public.orders (order_id),
  paused boolean not null default false,
  created_at timestamptz not null default now(),
  unique (household_id, canonical_item_id)
);

create index list_lines_household_id_idx on public.list_lines (household_id);

comment on table public.agent_credentials is
  'Agent keys (ck_live_…): hash only. Plaintext returned once at issue.';
comment on table public.order_events is
  'Append-only ledger. Never update; append a new status event.';
comment on table public.quotes is
  'Immutable once issued. No placement / preferred column exists.';
comment on column public.members.auth_user_id is
  'Supabase Auth user id for RLS; null until Auth is wired.';
