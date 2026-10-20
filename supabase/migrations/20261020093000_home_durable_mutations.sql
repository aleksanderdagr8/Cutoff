-- /home durable mutations via SECURITY DEFINER RPCs (anon JWT + Auth).
-- apps/web must never hold a privileged DB key (service_role hygiene).
-- Worker (cutoff-api) still uses service_role for agent Bearer quote/commit.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.home_current_member()
returns public.members
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  m public.members%rowtype;
begin
  if uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select * into m
  from public.members
  where auth_user_id = uid;

  if not found then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  return m;
end;
$$;

revoke all on function public.home_current_member() from public;
grant execute on function public.home_current_member() to authenticated;

create or replace function public.home_new_id()
returns text
language sql
volatile
as $$
  select replace(gen_random_uuid()::text, '-', '');
$$;

create or replace function public.home_mandate_json(p_mandate_id text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m public.mandates%rowtype;
  items text[];
  never_ids text[];
begin
  select * into m from public.mandates where mandate_id = p_mandate_id;
  if not found then
    return null;
  end if;

  select coalesce(array_agg(value order by value), '{}')
    into items
  from public.mandate_lines
  where mandate_id = p_mandate_id and kind = 'canonical_item';

  select coalesce(array_agg(value order by value), '{}')
    into never_ids
  from public.mandate_lines
  where mandate_id = p_mandate_id and kind = 'never_substitute';

  return json_build_object(
    'mandate_id', m.mandate_id,
    'ceiling_cents', m.ceiling_cents,
    'expires_at', m.expires_at_utc,
    'address_id', m.address_id,
    'never_substitute_ids', to_json(never_ids),
    'canonical_item_ids', to_json(items),
    'allow_cancel', m.allow_cancel
  );
end;
$$;

revoke all on function public.home_mandate_json(text) from public;

-- ---------------------------------------------------------------------------
-- List line upsert (internal first — called from mandate upsert)
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
  lid text;
begin
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

revoke all on function public.home_upsert_list_line_internal(text, text, text, integer, boolean) from public;

-- ---------------------------------------------------------------------------
-- Mandate upsert (create / lower / replace-on-raise) + sync list lines
-- ---------------------------------------------------------------------------

create or replace function public.home_upsert_mandate(
  p_ceiling_cents integer,
  p_expires_at timestamptz,
  p_address_id text,
  p_never_substitute_ids text[] default '{}',
  p_canonical_item_ids text[] default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  mem public.members%rowtype;
  existing public.mandates%rowtype;
  mid text;
  items text[];
  never_ids text[];
  v text;
begin
  mem := public.home_current_member();

  if p_ceiling_cents is null or p_ceiling_cents < 0 then
    raise exception 'invalid_body' using errcode = '22023';
  end if;
  if p_expires_at is null or p_address_id is null or length(trim(p_address_id)) = 0 then
    raise exception 'invalid_body' using errcode = '22023';
  end if;

  never_ids := coalesce(p_never_substitute_ids, '{}');

  select * into existing
  from public.mandates
  where household_id = mem.household_id
  order by created_at asc
  limit 1;

  if found then
    items := coalesce(p_canonical_item_ids, (
      select coalesce(array_agg(value), '{}')
      from public.mandate_lines
      where mandate_id = existing.mandate_id and kind = 'canonical_item'
    ));

    if p_ceiling_cents > existing.ceiling_cents then
      -- Humans may raise by replacing; agents cannot widen via API.
      mid := public.home_new_id();
      insert into public.mandates (
        mandate_id, household_id, ceiling_cents, expires_at_utc,
        address_id, actor_cap, allow_cancel, created_at, updated_at
      ) values (
        mid, mem.household_id, p_ceiling_cents, p_expires_at,
        trim(p_address_id), existing.actor_cap, existing.allow_cancel,
        now(), now()
      );
    else
      mid := existing.mandate_id;
      update public.mandates
      set
        ceiling_cents = p_ceiling_cents,
        expires_at_utc = p_expires_at,
        address_id = trim(p_address_id),
        updated_at = now()
      where mandate_id = mid;

      delete from public.mandate_lines where mandate_id = mid;
    end if;
  else
    items := coalesce(p_canonical_item_ids, array['item_towels_12']::text[]);
    mid := public.home_new_id();
    insert into public.mandates (
      mandate_id, household_id, ceiling_cents, expires_at_utc,
      address_id, actor_cap, allow_cancel, created_at, updated_at
    ) values (
      mid, mem.household_id, p_ceiling_cents, p_expires_at,
      trim(p_address_id), 4, true, now(), now()
    );
  end if;

  foreach v in array items loop
    if v is null or length(trim(v)) = 0 then
      continue;
    end if;
    insert into public.mandate_lines (line_id, mandate_id, kind, value)
    values (public.home_new_id(), mid, 'canonical_item', trim(v))
    on conflict (mandate_id, kind, value) do nothing;
  end loop;

  foreach v in array never_ids loop
    if v is null or length(trim(v)) = 0 then
      continue;
    end if;
    insert into public.mandate_lines (line_id, mandate_id, kind, value)
    values (public.home_new_id(), mid, 'never_substitute', trim(v))
    on conflict (mandate_id, kind, value) do nothing;
  end loop;

  -- Keep list in sync so agents can reorder by list_line_id.
  foreach v in array items loop
    if v is null or length(trim(v)) = 0 then
      continue;
    end if;
    perform public.home_upsert_list_line_internal(
      mem.household_id,
      mid,
      trim(v),
      case trim(v)
        when 'item_towels_12' then 28
        when 'item_coffee_12oz' then 21
        when 'item_filter_1' then 90
        else 30
      end,
      (trim(v) = any (never_ids))
    );
  end loop;

  return public.home_mandate_json(mid);
end;
$$;

revoke all on function public.home_upsert_mandate(integer, timestamptz, text, text[], text[]) from public;
grant execute on function public.home_upsert_mandate(integer, timestamptz, text, text[], text[]) to authenticated;

create or replace function public.home_upsert_list_line(
  p_canonical_item_id text,
  p_mandate_id text,
  p_cadence_hint_days integer default 30,
  p_never_substitute boolean default false
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  mem public.members%rowtype;
  m public.mandates%rowtype;
  lid text;
  row public.list_lines%rowtype;
begin
  mem := public.home_current_member();

  if p_canonical_item_id is null or length(trim(p_canonical_item_id)) = 0 then
    raise exception 'invalid_body' using errcode = '22023';
  end if;

  select * into m
  from public.mandates
  where mandate_id = p_mandate_id
    and household_id = mem.household_id;
  if not found then
    raise exception 'mandate_miss' using errcode = 'P0002';
  end if;

  lid := public.home_upsert_list_line_internal(
    mem.household_id,
    p_mandate_id,
    trim(p_canonical_item_id),
    p_cadence_hint_days,
    p_never_substitute
  );

  select * into row from public.list_lines where line_id = lid;
  return json_build_object(
    'line_id', row.line_id,
    'canonical_item_id', row.canonical_item_id,
    'mandate_id', row.mandate_id,
    'cadence_hint_days', row.cadence_hint_days,
    'never_substitute', row.never_substitute,
    'paused', row.paused
  );
end;
$$;

revoke all on function public.home_upsert_list_line(text, text, integer, boolean) from public;
grant execute on function public.home_upsert_list_line(text, text, integer, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Agent key issue / revoke
-- ---------------------------------------------------------------------------

create or replace function public.home_issue_agent_key(p_scopes text[])
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  mem public.members%rowtype;
  m public.mandates%rowtype;
  scopes text[];
  secret text;
  secret_hash text;
  kid text;
  created timestamptz := now();
begin
  mem := public.home_current_member();

  scopes := coalesce(p_scopes, array['quote', 'read_list']::text[]);
  if cardinality(scopes) = 0
     or not (scopes <@ array['quote', 'commit', 'read_list']::text[]) then
    raise exception 'invalid_body' using errcode = '22023';
  end if;

  select * into m
  from public.mandates
  where household_id = mem.household_id
  order by created_at desc
  limit 1;
  if not found then
    raise exception 'mandate_miss' using errcode = 'P0002';
  end if;

  -- ck_live_ + 48 hex chars (24 bytes) — matches packages/db generateAgentSecret.
  secret := 'ck_live_' || encode(gen_random_bytes(24), 'hex');
  secret_hash := encode(digest(convert_to(secret, 'UTF8'), 'sha256'), 'hex');
  kid := public.home_new_id();

  insert into public.agent_credentials (
    key_id, household_id, secret_hash, scopes, mandate_ids,
    revoked_at, last_used_at, created_at
  ) values (
    kid, mem.household_id, secret_hash, scopes, array[m.mandate_id],
    null, null, created
  );

  return json_build_object(
    'key_id', kid,
    'secret', secret,
    'scopes', to_json(scopes),
    'mandate_ids', to_json(array[m.mandate_id]),
    'revoked', false,
    'created_at', created,
    'last_used_at', null
  );
end;
$$;

revoke all on function public.home_issue_agent_key(text[]) from public;
grant execute on function public.home_issue_agent_key(text[]) to authenticated;

create or replace function public.home_revoke_agent_key(p_key_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  mem public.members%rowtype;
  row public.agent_credentials%rowtype;
  revoked_at timestamptz := now();
begin
  mem := public.home_current_member();

  select * into row
  from public.agent_credentials
  where key_id = p_key_id
    and household_id = mem.household_id;
  if not found then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  if row.revoked_at is null then
    update public.agent_credentials
    set revoked_at = revoked_at
    where key_id = p_key_id;
  else
    revoked_at := row.revoked_at;
  end if;

  insert into public.revocations (key_id, revoked_at)
  values (p_key_id, revoked_at)
  on conflict (key_id) do nothing;

  return json_build_object('key_id', p_key_id, 'revoked', true);
end;
$$;

revoke all on function public.home_revoke_agent_key(text) from public;
grant execute on function public.home_revoke_agent_key(text) to authenticated;

comment on function public.home_upsert_mandate is
  'Household /home: create or update mandate + sync list lines (Auth JWT).';
comment on function public.home_issue_agent_key is
  'Household /home: mint ck_live_… into agent_credentials; secret returned once.';
comment on function public.home_revoke_agent_key is
  'Household /home: revoke agent key + revocations row.';
comment on function public.home_upsert_list_line is
  'Household /home: upsert list_lines for the Auth member household.';
