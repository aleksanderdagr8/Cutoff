-- Lock down SECURITY DEFINER RPCs, one-quote-one-order, atomic commit record.
-- Apply manually (supabase db push or SQL editor). Do not run from the API deploy.
--
-- Live ACLs granted EXECUTE to anon and authenticated via default privileges.
-- REVOKE FROM public does not remove those explicit grants, so this migration
-- revokes anon (and authenticated where the function is not a household API).

-- ---------------------------------------------------------------------------
-- home_new_id: pin search_path (advisor 0011). gen_random_uuid is pg_catalog.
-- ---------------------------------------------------------------------------

create or replace function public.home_new_id()
returns text
language sql
volatile
set search_path = ''
as $$
  select replace(pg_catalog.gen_random_uuid()::text, '-', '');
$$;

-- ---------------------------------------------------------------------------
-- Internal list upsert: caller may only write their own household.
-- auth.uid() is the JWT user even when a SECURITY DEFINER wrapper calls this.
-- Direct anon / other-household calls raise. Mandate must belong to that home.
-- ---------------------------------------------------------------------------

create or replace function public.home_upsert_list_line_internal(
  p_household_id text,
  p_mandate_id text,
  p_canonical_item_id text,
  p_cadence_hint_days integer,
  p_never_substitute boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.list_lines%rowtype;
  caller_household text;
  lid text;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select m.household_id into caller_household
  from public.members m
  where m.auth_user_id = auth.uid();

  if caller_household is null or caller_household is distinct from p_household_id then
    raise exception 'household_mismatch' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.mandates
    where mandate_id = p_mandate_id
      and household_id = p_household_id
  ) then
    raise exception 'mandate_miss' using errcode = 'P0002';
  end if;

  select * into existing
  from public.list_lines
  where household_id = p_household_id
    and canonical_item_id = p_canonical_item_id;

  if found then
    update public.list_lines
    set
      mandate_id = p_mandate_id,
      cadence_hint_days = coalesce(p_cadence_hint_days, cadence_hint_days),
      never_substitute = coalesce(p_never_substitute, never_substitute)
    where line_id = existing.line_id;
    return existing.line_id;
  end if;

  lid := 'll_' || public.home_new_id();
  insert into public.list_lines (
    line_id, household_id, mandate_id, canonical_item_id,
    cadence_hint_days, cadence_source, never_substitute,
    lead_days, paused, created_at
  ) values (
    lid, p_household_id, p_mandate_id, p_canonical_item_id,
    p_cadence_hint_days, 'fixed', coalesce(p_never_substitute, false),
    3, false, now()
  );
  return lid;
end;
$$;

comment on function public.home_upsert_list_line_internal(text, text, text, integer, boolean) is
  'Internal list upsert. Refuses cross-household writes. Not granted to anon or authenticated; wrappers call it as the owner.';

-- ---------------------------------------------------------------------------
-- One quote → at most one order. Unique index also covers orders.quote_id FK.
-- ---------------------------------------------------------------------------

create unique index if not exists orders_quote_id_uidx
  on public.orders (quote_id);

-- ---------------------------------------------------------------------------
-- Atomic commit record: order + committed event + evidence + idempotency key
-- + mark quote used + release hold. Payment is intentionally not in here.
-- One plpgsql function body runs as a single transaction.
-- ---------------------------------------------------------------------------

create or replace function public.commit_order_record(
  p_order_id text,
  p_household_id text,
  p_canonical_item_id text,
  p_quote_id text,
  p_amount_cents integer,
  p_idempotency_key text,
  p_now timestamptz,
  p_event_id text,
  p_evidence_id text,
  p_actor_chain text[],
  p_protocol text,
  p_agent_key_id text,
  p_mandate_id text,
  p_quote_hash text,
  p_address_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.orders%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_quote_id, 0));

  select * into existing
  from public.orders
  where household_id = p_household_id
    and idempotency_key = p_idempotency_key;

  if not found then
    select * into existing
    from public.orders
    where quote_id = p_quote_id;
  end if;

  if found then
    if existing.household_id is distinct from p_household_id then
      raise exception 'quote_mismatch' using errcode = '42501';
    end if;

    update public.quotes
    set committed_at_utc = coalesce(committed_at_utc, p_now)
    where quote_id = existing.quote_id;

    delete from public.quote_holds
    where quote_id = existing.quote_id;

    return jsonb_build_object(
      'created', false,
      'order_id', existing.order_id
    );
  end if;

  insert into public.orders (
    order_id, household_id, canonical_item_id, quote_id,
    amount_cents, charge_id, idempotency_key, status, created_at
  ) values (
    p_order_id, p_household_id, p_canonical_item_id, p_quote_id,
    p_amount_cents, null, p_idempotency_key, 'committed', p_now
  );

  insert into public.order_events (event_id, order_id, status, at_utc)
  values (p_event_id, p_order_id, 'committed', p_now);

  insert into public.evidence (
    evidence_id, order_id, actor_chain, protocol, agent_key_id,
    mandate_id, quote_hash, address_id, amount_cents, created_at
  ) values (
    p_evidence_id, p_order_id, p_actor_chain, p_protocol, p_agent_key_id,
    p_mandate_id, p_quote_hash, p_address_id, p_amount_cents, p_now
  );

  insert into public.idempotency_keys (
    household_id, idempotency_key, order_id, created_at
  ) values (
    p_household_id, p_idempotency_key, p_order_id, p_now
  );

  update public.quotes
  set committed_at_utc = coalesce(committed_at_utc, p_now)
  where quote_id = p_quote_id;

  delete from public.quote_holds
  where quote_id = p_quote_id;

  return jsonb_build_object(
    'created', true,
    'order_id', p_order_id
  );
exception
  when unique_violation then
    select * into existing
    from public.orders
    where household_id = p_household_id
      and idempotency_key = p_idempotency_key;

    if not found then
      select * into existing
      from public.orders
      where quote_id = p_quote_id;
    end if;

    if not found then
      raise;
    end if;

    if existing.household_id is distinct from p_household_id then
      raise exception 'quote_mismatch' using errcode = '42501';
    end if;

    update public.quotes
    set committed_at_utc = coalesce(committed_at_utc, p_now)
    where quote_id = existing.quote_id;

    delete from public.quote_holds
    where quote_id = existing.quote_id;

    return jsonb_build_object(
      'created', false,
      'order_id', existing.order_id
    );
end;
$$;

comment on function public.commit_order_record(
  text, text, text, text, integer, text, timestamptz,
  text, text, text[], text, text, text, text, text
) is
  'Atomic order + evidence + idempotency key + quote used. Service role only. Pay/place happen after this returns.';

revoke all on function public.commit_order_record(
  text, text, text, text, integer, text, timestamptz,
  text, text, text[], text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.commit_order_record(
  text, text, text, text, integer, text, timestamptz,
  text, text, text[], text, text, text, text, text
) to service_role;

-- ---------------------------------------------------------------------------
-- Stop anon (unauthenticated) EXECUTE on every SECURITY DEFINER function
-- the advisor flagged. Re-grant authenticated only for household APIs and
-- the RLS helper. Internal / event-trigger functions stay owner-only.
-- ---------------------------------------------------------------------------

revoke all on function public.current_member_household_ids() from public, anon, authenticated;
grant execute on function public.current_member_household_ids() to authenticated;

revoke all on function public.ensure_home_member() from public, anon, authenticated;
grant execute on function public.ensure_home_member() to authenticated;

revoke all on function public.home_current_member() from public, anon, authenticated;
grant execute on function public.home_current_member() to authenticated;

revoke all on function public.home_issue_agent_key(text[]) from public, anon, authenticated;
grant execute on function public.home_issue_agent_key(text[]) to authenticated;

revoke all on function public.home_revoke_agent_key(text) from public, anon, authenticated;
grant execute on function public.home_revoke_agent_key(text) to authenticated;

revoke all on function public.home_upsert_list_line(text, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.home_upsert_list_line(text, text, integer, boolean) to authenticated;

revoke all on function public.home_upsert_mandate(integer, timestamptz, text, text[], text[]) from public, anon, authenticated;
grant execute on function public.home_upsert_mandate(integer, timestamptz, text, text[], text[]) to authenticated;

-- Cross-household read if granted: only called from security-definer wrappers.
revoke all on function public.home_mandate_json(text) from public, anon, authenticated;

revoke all on function public.home_upsert_list_line_internal(text, text, text, integer, boolean) from public, anon, authenticated;

-- Installed by Supabase as an event trigger, not by our migrations.
do $rls$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$rls$;

-- ---------------------------------------------------------------------------
-- Covering indexes for foreign keys the performance advisor listed.
-- orders.quote_id is covered by orders_quote_id_uidx above.
-- ---------------------------------------------------------------------------

create index if not exists equivalences_to_canonical_item_id_idx
  on public.equivalences (to_canonical_item_id);

create index if not exists evidence_agent_key_id_idx
  on public.evidence (agent_key_id);

create index if not exists evidence_mandate_id_idx
  on public.evidence (mandate_id);

create index if not exists fulfillment_jobs_household_id_idx
  on public.fulfillment_jobs (household_id);

create index if not exists idempotency_keys_order_id_idx
  on public.idempotency_keys (order_id);

create index if not exists list_lines_canonical_item_id_idx
  on public.list_lines (canonical_item_id);

create index if not exists list_lines_last_order_id_idx
  on public.list_lines (last_order_id);

create index if not exists list_lines_last_quote_id_idx
  on public.list_lines (last_quote_id);

create index if not exists list_lines_mandate_id_idx
  on public.list_lines (mandate_id);

create index if not exists merchant_score_events_order_id_idx
  on public.merchant_score_events (order_id);

create index if not exists orders_canonical_item_id_idx
  on public.orders (canonical_item_id);

create index if not exists quote_holds_canonical_item_id_idx
  on public.quote_holds (canonical_item_id);

create index if not exists quote_holds_quote_id_idx
  on public.quote_holds (quote_id);

create index if not exists quotes_agent_key_id_idx
  on public.quotes (agent_key_id);

create index if not exists quotes_canonical_item_id_idx
  on public.quotes (canonical_item_id);

create index if not exists quotes_mandate_id_idx
  on public.quotes (mandate_id);

create index if not exists quotes_offer_id_idx
  on public.quotes (offer_id);

create index if not exists refunds_order_id_idx
  on public.refunds (order_id);

create index if not exists reorder_nudges_resolved_order_id_idx
  on public.reorder_nudges (resolved_order_id);

create index if not exists return_requests_household_id_idx
  on public.return_requests (household_id);

create index if not exists return_requests_order_id_idx
  on public.return_requests (order_id);

create index if not exists shipment_events_job_id_idx
  on public.shipment_events (job_id);

create index if not exists shipment_events_order_id_idx
  on public.shipment_events (order_id);
