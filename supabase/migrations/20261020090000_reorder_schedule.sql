-- Unit 14: reorder schedule columns + nudge tables (MCP/reorder spec §5.2).
-- Learned cadence columns are reserved; logic stays off until P4.
-- Worker uses service_role (bypasses RLS). Members: SELECT own household only.

-- ---------------------------------------------------------------------------
-- list_lines: fixed-cadence due fields
-- ---------------------------------------------------------------------------

alter table public.list_lines
  add column cadence_source text not null default 'fixed'
    check (cadence_source in ('fixed', 'learned')),
  add column learned_interval_days integer
    check (learned_interval_days is null or learned_interval_days >= 1),
  add column last_ordered_at timestamptz,
  add column next_due_at timestamptz,
  add column snoozed_until timestamptz,
  add column lead_days integer not null default 3
    check (lead_days between 0 and 30);

create index list_lines_due_idx on public.list_lines (next_due_at)
  where paused = false;

comment on column public.list_lines.cadence_source is
  'fixed (P1) or learned (P4 reserved). App logic ignores learned until P4.';
comment on column public.list_lines.learned_interval_days is
  'Reserved for P4 median-interval cadence; unused in P1–P3.';
comment on column public.list_lines.lead_days is
  'Days before next_due_at when cron may enqueue a nudge (Unit 20).';

-- ---------------------------------------------------------------------------
-- household_nudge_settings (webhook secret per household — Locked §8.7)
-- ---------------------------------------------------------------------------

create table public.household_nudge_settings (
  household_id text primary key references public.households (household_id),
  agent_webhook_url text,
  agent_webhook_secret_ref text,
  email_enabled boolean not null default true,
  auto_commit_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  check (
    agent_webhook_url is null
    or agent_webhook_url like 'https://%'
  ),
  check (auto_commit_enabled = false)
);

comment on table public.household_nudge_settings is
  'Per-household nudge channels. auto_commit_enabled reserved false (v1 never auto-commits).';
comment on column public.household_nudge_settings.agent_webhook_secret_ref is
  'Vault / CF secret store ref — never plaintext webhook HMAC secret.';

-- ---------------------------------------------------------------------------
-- reorder_nudges (one row per line/cycle/channel)
-- ---------------------------------------------------------------------------

create table public.reorder_nudges (
  nudge_id text primary key,
  household_id text not null references public.households (household_id),
  line_id text not null references public.list_lines (line_id),
  due_at timestamptz not null,
  channel text not null check (channel in ('agent_webhook', 'email')),
  status text not null default 'pending'
    check (
      status in (
        'pending',
        'sent',
        'failed',
        'acted',
        'skipped',
        'expired'
      )
    ),
  attempts integer not null default 0 check (attempts >= 0),
  resolved_order_id text references public.orders (order_id),
  created_at timestamptz not null default now(),
  unique (line_id, due_at, channel)
);

create index reorder_nudges_household_id_idx
  on public.reorder_nudges (household_id);
create index reorder_nudges_status_idx
  on public.reorder_nudges (status)
  where status = 'pending';

comment on table public.reorder_nudges is
  'Durable nudge intents. Cron inserts; queue delivers (Unit 20–21).';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.household_nudge_settings enable row level security;
alter table public.reorder_nudges enable row level security;

create policy household_nudge_settings_member_select
  on public.household_nudge_settings
  for select to authenticated
  using (household_id in (select public.current_member_household_ids()));

create policy reorder_nudges_member_select on public.reorder_nudges
  for select to authenticated
  using (household_id in (select public.current_member_household_ids()));

-- No authenticated insert/update/delete: members mutate via Worker BFF
-- (service_role) until finer policies land. list_lines member policies
-- already cover SELECT/UPDATE for cadence/snooze UI fields.
