-- One commit per quote, idempotent on (household, idempotency key), append-only ledger.
-- Apply manually after 20261020193151_lock_down_commit_and_rpc_execute.sql.
-- Do not run this from the API deploy or from CI.
--
-- Replaces commit_order_record in place (same signature). Payment stays outside
-- this transaction: the function writes the order, the committed event, the
-- evidence pack, and the idempotency key, then marks the quote used.

create unique index if not exists orders_quote_id_uidx
  on public.orders (quote_id);

-- ---------------------------------------------------------------------------
-- Reject UPDATE / DELETE / TRUNCATE on the ledger and the evidence pack.
-- Inserts stay allowed. Service role included: RLS does not stop it.
-- ---------------------------------------------------------------------------

create or replace function public.reject_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'append_only' using errcode = '55000';
end;
$$;

comment on function public.reject_ledger_mutation() is
  'Blocks mutation of append-only ledger and evidence rows.';

revoke all on function public.reject_ledger_mutation() from public, anon, authenticated;
grant execute on function public.reject_ledger_mutation() to service_role;

drop trigger if exists order_events_append_only on public.order_events;
create trigger order_events_append_only
  before update or delete on public.order_events
  for each row
  execute function public.reject_ledger_mutation();

drop trigger if exists order_events_no_truncate on public.order_events;
create trigger order_events_no_truncate
  before truncate on public.order_events
  for each statement
  execute function public.reject_ledger_mutation();

drop trigger if exists evidence_append_only on public.evidence;
create trigger evidence_append_only
  before update or delete on public.evidence
  for each row
  execute function public.reject_ledger_mutation();

drop trigger if exists evidence_no_truncate on public.evidence;
create trigger evidence_no_truncate
  before truncate on public.evidence
  for each statement
  execute function public.reject_ledger_mutation();

-- ---------------------------------------------------------------------------
-- Atomic commit record. Locks the quote id and the idempotency key in hash
-- order, then locks the quote row. One plpgsql body is one transaction.
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
set search_path = ''
as $$
declare
  existing public.orders%rowtype;
  lock_quote bigint;
  lock_idem bigint;
begin
  lock_quote := pg_catalog.hashtextextended(p_quote_id, 0);
  lock_idem := pg_catalog.hashtextextended(
    p_household_id || pg_catalog.chr(31) || p_idempotency_key,
    1
  );

  if lock_quote <= lock_idem then
    perform pg_catalog.pg_advisory_xact_lock(lock_quote);
    perform pg_catalog.pg_advisory_xact_lock(lock_idem);
  else
    perform pg_catalog.pg_advisory_xact_lock(lock_idem);
    perform pg_catalog.pg_advisory_xact_lock(lock_quote);
  end if;

  perform 1
  from public.quotes
  where quote_id = p_quote_id
  for update;

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

    return pg_catalog.jsonb_build_object(
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

  return pg_catalog.jsonb_build_object(
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

    return pg_catalog.jsonb_build_object(
      'created', false,
      'order_id', existing.order_id
    );
end;
$$;

comment on function public.commit_order_record(
  text, text, text, text, integer, text, timestamptz,
  text, text, text[], text, text, text, text, text
) is
  'Atomic order + evidence + idempotency key + quote used. One row per quote_id. Service role only. Pay/place happen after this returns.';

revoke all on function public.commit_order_record(
  text, text, text, text, integer, text, timestamptz,
  text, text, text[], text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.commit_order_record(
  text, text, text, text, integer, text, timestamptz,
  text, text, text[], text, text, text, text, text
) to service_role;
