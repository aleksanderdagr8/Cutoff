-- RLS sketches for household-scoped tables (framework §3, Unit 1).
-- Worker / apps/api uses the service_role key → bypasses RLS.
-- Browser / apps/web uses the anon key + signed-in Auth JWT → policies below.
-- Agents never use the anon key; they hit the Worker with Bearer ck_live_….
--
-- Until members.auth_user_id is linked to auth.users, member policies match
-- zero rows (fail closed). Service role still has full access for the Worker.

-- Helper: households the current Auth user belongs to.
create or replace function public.current_member_household_ids()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select m.household_id
  from public.members m
  where m.auth_user_id is not null
    and m.auth_user_id = auth.uid();
$$;

revoke all on function public.current_member_household_ids() from public;
grant execute on function public.current_member_household_ids() to authenticated;
grant execute on function public.current_member_household_ids() to anon;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

alter table public.principals enable row level security;
alter table public.households enable row level security;
alter table public.members enable row level security;
alter table public.agent_credentials enable row level security;
alter table public.revocations enable row level security;
alter table public.mandates enable row level security;
alter table public.mandate_lines enable row level security;
alter table public.canonical_items enable row level security;
alter table public.equivalences enable row level security;
alter table public.offers enable row level security;
alter table public.offer_sources enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_holds enable row level security;
alter table public.orders enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.order_events enable row level security;
alter table public.evidence enable row level security;
alter table public.charges enable row level security;
alter table public.refunds enable row level security;
alter table public.fulfillment_jobs enable row level security;
alter table public.shipment_events enable row level security;
alter table public.return_requests enable row level security;
alter table public.merchant_score_events enable row level security;
alter table public.merchant_scores enable row level security;
alter table public.risk_audits enable row level security;
alter table public.risk_flags enable row level security;
alter table public.suspended_merchants enable row level security;
alter table public.receipts enable row level security;
alter table public.list_lines enable row level security;

-- ---------------------------------------------------------------------------
-- Household tables: member SELECT own household only (no anon writes)
-- ---------------------------------------------------------------------------

create policy households_member_select on public.households
  for select to authenticated
  using (household_id in (select public.current_member_household_ids()));

create policy members_member_select on public.members
  for select to authenticated
  using (household_id in (select public.current_member_household_ids()));

create policy mandates_member_select on public.mandates
  for select to authenticated
  using (household_id in (select public.current_member_household_ids()));

create policy mandate_lines_member_select on public.mandate_lines
  for select to authenticated
  using (
    mandate_id in (
      select mandate_id
      from public.mandates
      where household_id in (select public.current_member_household_ids())
    )
  );

-- Keys: members may list metadata for their household.
-- secret_hash must never be returned by the console BFF (repo projection).
create policy agent_credentials_member_select on public.agent_credentials
  for select to authenticated
  using (household_id in (select public.current_member_household_ids()));

create policy quotes_member_select on public.quotes
  for select to authenticated
  using (household_id in (select public.current_member_household_ids()));

create policy orders_member_select on public.orders
  for select to authenticated
  using (household_id in (select public.current_member_household_ids()));

create policy order_events_member_select on public.order_events
  for select to authenticated
  using (
    order_id in (
      select order_id
      from public.orders
      where household_id in (select public.current_member_household_ids())
    )
  );

create policy evidence_member_select on public.evidence
  for select to authenticated
  using (
    order_id in (
      select order_id
      from public.orders
      where household_id in (select public.current_member_household_ids())
    )
  );

create policy receipts_member_select on public.receipts
  for select to authenticated
  using (household_id in (select public.current_member_household_ids()));

create policy list_lines_member_select on public.list_lines
  for select to authenticated
  using (household_id in (select public.current_member_household_ids()));

create policy list_lines_member_update on public.list_lines
  for update to authenticated
  using (household_id in (select public.current_member_household_ids()))
  with check (household_id in (select public.current_member_household_ids()));

create policy fulfillment_jobs_member_select on public.fulfillment_jobs
  for select to authenticated
  using (household_id in (select public.current_member_household_ids()));

create policy shipment_events_member_select on public.shipment_events
  for select to authenticated
  using (
    order_id in (
      select order_id
      from public.orders
      where household_id in (select public.current_member_household_ids())
    )
  );

create policy return_requests_member_select on public.return_requests
  for select to authenticated
  using (household_id in (select public.current_member_household_ids()));

-- ---------------------------------------------------------------------------
-- Catalog / offers: readable to authenticated household members (no PII)
-- Writes: service role only (no insert/update/delete policies for anon/auth).
-- ---------------------------------------------------------------------------

create policy canonical_items_authenticated_select on public.canonical_items
  for select to authenticated
  using (true);

create policy equivalences_authenticated_select on public.equivalences
  for select to authenticated
  using (true);

create policy offers_authenticated_select on public.offers
  for select to authenticated
  using (true);

create policy merchant_scores_authenticated_select on public.merchant_scores
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Deny-by-default notes (intentional absence of policies)
-- ---------------------------------------------------------------------------
-- principals, revocations, charges, refunds, idempotency_keys, quote_holds,
-- offer_sources, merchant_score_events, risk_*: no authenticated policies →
-- only service_role (Worker) can read/write.
--
-- No insert/delete policies on household tables for authenticated →
-- members cannot forge orders/quotes via the anon path (Unit 1).
-- Human mutations (lower ceiling, skip list, issue key) go through Worker
-- BFF with service_role + session checks until finer policies land.
