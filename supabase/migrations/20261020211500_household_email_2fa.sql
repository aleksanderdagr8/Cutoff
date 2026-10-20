-- Household email second step.
--
-- Supabase Auth MFA is TOTP or phone, not email. Password grant
-- (POST /auth/v1/token?grant_type=password) still issues a JWT to anyone
-- who has the anon key. This migration makes that JWT useless for household
-- data until a 6-digit code is accepted.
--
-- The code itself is GoTrue's reauthentication OTP, mailed by Auth SMTP
-- (template: reauthentication, variable {{ .Token }}). GoTrue stores
-- SHA-224(email || code) on auth.users.reauthentication_token — the same
-- hash as crypto.GenerateTokenHash. We copy that hash into
-- private.email_challenges. The plaintext code is never stored and is never
-- returned by an RPC.
--
-- Known vector (GoTrue issue 1245 / pgcrypto on this project):
--   sha224("gotrue@testing.email.ai.moda" || "131337")
--   = 3f4cef3ebadfa21c8a4559e025966e5806dcc6081d3cf657444c0054
--
-- Grants are per auth session_id and only after the JWT amr includes
-- "password", so a recovery or signup-confirm session cannot skip the
-- password. Online guesses stop at 5. Sends stop at 3 / 15 minutes and
-- 8 / 24 hours. Codes expire 10 minutes after GoTrue sent them.
--
-- cutoff-api talks to Postgres as service_role, which bypasses these
-- policies, and it calls commit_order_record rather than the /home RPCs.
-- This file does not change that path and does not touch stripe_customer_id
-- (nullable; household inserts name their columns, so either migration
-- order is safe).

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

create table private.email_challenges (
  challenge_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null,
  code_hash text not null,
  sent_at timestamptz not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint email_challenges_hash_hex check (code_hash ~ '^[0-9a-f]{56}$'),
  constraint email_challenges_attempts_nonneg check (attempts >= 0),
  constraint email_challenges_max_attempts check (max_attempts between 1 and 10)
);

create index email_challenges_user_created_idx
  on private.email_challenges (user_id, created_at desc);

create index email_challenges_open_session_idx
  on private.email_challenges (session_id, created_at desc)
  where consumed_at is null;

create table private.email_2fa_grants (
  session_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index email_2fa_grants_user_idx
  on private.email_2fa_grants (user_id);

alter table private.email_challenges enable row level security;
alter table private.email_2fa_grants enable row level security;

revoke all on table private.email_challenges from public, anon, authenticated;
revoke all on table private.email_2fa_grants from public, anon, authenticated;

comment on table private.email_challenges is
  'Hashed email login codes. No client policies. Only security definer RPCs write it.';
comment on table private.email_2fa_grants is
  'Password sessions that have entered the email code. RLS denies direct reads.';

-- Idempotency for the welcome-member edge function (public so PostgREST
-- service_role can write it). No anon/authenticated policies.
create table public.member_welcome_emails (
  member_id text primary key references public.members (member_id) on delete cascade,
  email text not null,
  sent_at timestamptz not null default now()
);

alter table public.member_welcome_emails enable row level security;

revoke all on table public.member_welcome_emails from public, anon, authenticated;
grant select, insert, delete on table public.member_welcome_emails to service_role;

comment on table public.member_welcome_emails is
  'One welcome email per member. Written by the welcome-member edge function.';

-- ---------------------------------------------------------------------------
-- Helpers (not granted to the Data API)
-- ---------------------------------------------------------------------------

create or replace function private.current_session_id()
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  raw text;
begin
  raw := auth.jwt() ->> 'session_id';
  if raw is null or length(raw) = 0 then
    return null;
  end if;
  return raw::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function private.session_used_password()
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from jsonb_array_elements(
      case
        when jsonb_typeof(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) = 'array'
          then coalesce(auth.jwt() -> 'amr', '[]'::jsonb)
        else '[]'::jsonb
      end
    ) as elem
    where elem ->> 'method' = 'password'
  );
$$;

create or replace function private.email_2fa_send_block(p_user_id uuid)
returns text
language sql
stable
set search_path = private
as $$
  select case
    when (
      select count(*)
      from private.email_challenges
      where user_id = p_user_id
        and created_at > now() - interval '15 minutes'
    ) >= 3 then 'rate_limited'
    when (
      select count(*)
      from private.email_challenges
      where user_id = p_user_id
        and created_at > now() - interval '24 hours'
    ) >= 8 then 'rate_limited'
    else null
  end;
$$;

create or replace function private.clear_reauthentication_token(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update auth.users
  set
    reauthentication_token = '',
    reauthentication_sent_at = null
  where id = p_user_id;

  delete from auth.one_time_tokens
  where user_id = p_user_id
    and token_type = 'reauthentication_token'::auth.one_time_token_type;
end;
$$;

revoke all on function private.current_session_id() from public, anon, authenticated;
revoke all on function private.session_used_password() from public, anon, authenticated;
revoke all on function private.email_2fa_send_block(uuid) from public, anon, authenticated;
revoke all on function private.clear_reauthentication_token(uuid) from public, anon, authenticated;

create or replace function public.email_2fa_ok()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from private.email_2fa_grants g
    where g.user_id = auth.uid()
      and g.session_id = private.current_session_id()
      and g.expires_at > now()
  );
$$;

revoke all on function public.email_2fa_ok() from public, anon, authenticated;
grant execute on function public.email_2fa_ok() to authenticated;

comment on function public.email_2fa_ok() is
  'True only when this password session has verified an email code. Used by RLS and household RPCs.';

-- ---------------------------------------------------------------------------
-- Challenge RPCs (authenticated). None of them return a code.
-- ---------------------------------------------------------------------------

create or replace function public.home_email_2fa_status()
returns json
language plpgsql
stable
security definer
set search_path = public, private, auth
as $$
declare
  uid uuid := auth.uid();
  sid uuid;
  user_email text;
  exp timestamptz;
begin
  if uid is null then
    return json_build_object('granted', false, 'pending', false);
  end if;

  select u.email into user_email from auth.users u where u.id = uid;
  sid := private.current_session_id();

  select c.expires_at
    into exp
  from private.email_challenges c
  where c.user_id = uid
    and c.session_id = sid
    and c.consumed_at is null
    and c.expires_at > now()
  order by c.created_at desc
  limit 1;

  return json_build_object(
    'granted', public.email_2fa_ok(),
    'pending', exp is not null,
    'expires_at', exp,
    'email', user_email,
    'password', private.session_used_password()
  );
end;
$$;

create or replace function public.home_email_2fa_may_send()
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  uid uuid := auth.uid();
  block text;
begin
  if uid is null then
    return json_build_object('ok', false, 'reason', 'unauthenticated');
  end if;
  if not private.session_used_password() then
    return json_build_object('ok', false, 'reason', 'password_required');
  end if;
  block := private.email_2fa_send_block(uid);
  if block is not null then
    return json_build_object('ok', false, 'reason', block);
  end if;
  return json_build_object('ok', true);
end;
$$;

create or replace function public.home_begin_email_2fa()
returns json
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  uid uuid := auth.uid();
  sid uuid;
  token text;
  sent_at timestamptz;
  block text;
  existing private.email_challenges%rowtype;
  prior private.email_challenges%rowtype;
  expires_at timestamptz;
begin
  if uid is null then
    return json_build_object('ok', false, 'reason', 'unauthenticated');
  end if;
  if not private.session_used_password() then
    return json_build_object('ok', false, 'reason', 'password_required');
  end if;

  sid := private.current_session_id();
  if sid is null then
    return json_build_object('ok', false, 'reason', 'no_session');
  end if;

  select u.reauthentication_token, u.reauthentication_sent_at
    into token, sent_at
  from auth.users u
  where u.id = uid;

  if token is null or length(token) = 0 or sent_at is null then
    return json_build_object('ok', false, 'reason', 'code_not_ready');
  end if;

  if token !~ '^[0-9a-f]{56}$' then
    return json_build_object('ok', false, 'reason', 'code_not_ready');
  end if;

  expires_at := least(sent_at + interval '10 minutes', now() + interval '10 minutes');
  if expires_at <= now() then
    return json_build_object('ok', false, 'reason', 'expired');
  end if;

  select * into existing
  from private.email_challenges c
  where c.user_id = uid
    and c.session_id = sid
    and c.code_hash = token
    and c.consumed_at is null
    and c.expires_at > now()
  order by c.created_at desc
  limit 1;

  if found then
    return json_build_object('ok', true, 'expires_at', existing.expires_at, 'reused', true);
  end if;

  select * into prior
  from private.email_challenges c
  where c.user_id = uid
    and c.code_hash = token
    and c.attempts >= c.max_attempts
  order by c.created_at desc
  limit 1;

  if found then
    return json_build_object('ok', false, 'reason', 'locked');
  end if;

  block := private.email_2fa_send_block(uid);
  if block is not null then
    return json_build_object('ok', false, 'reason', block);
  end if;

  update private.email_challenges
  set consumed_at = now()
  where user_id = uid
    and session_id = sid
    and consumed_at is null;

  insert into private.email_challenges (
    user_id, session_id, code_hash, sent_at, expires_at, max_attempts
  ) values (
    uid, sid, token, sent_at, expires_at, 5
  );

  return json_build_object('ok', true, 'expires_at', expires_at);
end;
$$;

create or replace function public.home_verify_email_2fa(p_code text)
returns json
language plpgsql
security definer
set search_path = public, private, extensions, auth
as $$
declare
  uid uuid := auth.uid();
  sid uuid;
  user_email text;
  ch private.email_challenges%rowtype;
  digest_hex text;
  attempts_left integer;
begin
  if uid is null then
    return json_build_object('ok', false, 'reason', 'unauthenticated');
  end if;
  if not private.session_used_password() then
    return json_build_object('ok', false, 'reason', 'password_required');
  end if;

  sid := private.current_session_id();
  if sid is null then
    return json_build_object('ok', false, 'reason', 'no_session');
  end if;

  if p_code is null or p_code !~ '^[0-9]{6}$' then
    return json_build_object('ok', false, 'reason', 'mismatch');
  end if;

  select *
    into ch
  from private.email_challenges c
  where c.user_id = uid
    and c.session_id = sid
    and c.consumed_at is null
  order by c.created_at desc
  limit 1
  for update;

  if not found then
    return json_build_object('ok', false, 'reason', 'missing');
  end if;

  if ch.expires_at <= now() then
    update private.email_challenges
    set consumed_at = now()
    where challenge_id = ch.challenge_id;
    perform private.clear_reauthentication_token(uid);
    return json_build_object('ok', false, 'reason', 'expired');
  end if;

  if ch.attempts >= ch.max_attempts then
    update private.email_challenges
    set consumed_at = now()
    where challenge_id = ch.challenge_id;
    perform private.clear_reauthentication_token(uid);
    return json_build_object('ok', false, 'reason', 'locked', 'attempts_left', 0);
  end if;

  update private.email_challenges
  set attempts = attempts + 1
  where challenge_id = ch.challenge_id
  returning * into ch;

  select u.email into user_email from auth.users u where u.id = uid;
  if user_email is null or length(user_email) = 0 then
    return json_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  digest_hex := encode(
    extensions.digest(convert_to(user_email || p_code, 'UTF8'), 'sha224'),
    'hex'
  );

  if digest_hex = ch.code_hash then
    update private.email_challenges
    set consumed_at = now()
    where challenge_id = ch.challenge_id;

    insert into private.email_2fa_grants (session_id, user_id, verified_at, expires_at)
    values (sid, uid, now(), now() + interval '30 days')
    on conflict (session_id) do update
      set user_id = excluded.user_id,
          verified_at = excluded.verified_at,
          expires_at = excluded.expires_at;

    perform private.clear_reauthentication_token(uid);
    return json_build_object('ok', true);
  end if;

  attempts_left := ch.max_attempts - ch.attempts;
  if ch.attempts >= ch.max_attempts then
    update private.email_challenges
    set consumed_at = now()
    where challenge_id = ch.challenge_id;
    perform private.clear_reauthentication_token(uid);
    return json_build_object('ok', false, 'reason', 'locked', 'attempts_left', 0);
  end if;

  return json_build_object(
    'ok', false,
    'reason', 'mismatch',
    'attempts_left', attempts_left
  );
end;
$$;

create or replace function public.home_clear_email_2fa()
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  uid uuid := auth.uid();
  sid uuid;
begin
  if uid is null then
    return json_build_object('ok', true);
  end if;
  sid := private.current_session_id();
  if sid is not null then
    delete from private.email_2fa_grants
    where session_id = sid
      and user_id = uid;
  end if;
  update private.email_challenges
  set consumed_at = now()
  where user_id = uid
    and consumed_at is null
    and (sid is null or session_id = sid);
  return json_build_object('ok', true);
end;
$$;

revoke all on function public.home_email_2fa_status() from public, anon, authenticated;
revoke all on function public.home_email_2fa_may_send() from public, anon, authenticated;
revoke all on function public.home_begin_email_2fa() from public, anon, authenticated;
revoke all on function public.home_verify_email_2fa(text) from public, anon, authenticated;
revoke all on function public.home_clear_email_2fa() from public, anon, authenticated;

grant execute on function public.home_email_2fa_status() to authenticated;
grant execute on function public.home_email_2fa_may_send() to authenticated;
grant execute on function public.home_begin_email_2fa() to authenticated;
grant execute on function public.home_verify_email_2fa(text) to authenticated;
grant execute on function public.home_clear_email_2fa() to authenticated;

-- ---------------------------------------------------------------------------
-- Household reads and RPCs fail closed until the grant exists.
-- service_role bypasses RLS. SECURITY DEFINER household RPCs check explicitly.
-- ---------------------------------------------------------------------------

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
    and m.auth_user_id = auth.uid()
    and public.email_2fa_ok();
$$;

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

  if not public.email_2fa_ok() then
    raise exception 'email_2fa_required' using errcode = '28000';
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

create or replace function public.ensure_home_member()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  user_email text;
  m public.members%rowtype;
  h public.households%rowtype;
  new_household_id text;
  new_member_id text;
  home_name text;
begin
  if uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  if not public.email_2fa_ok() then
    raise exception 'email_2fa_required' using errcode = '28000';
  end if;

  select u.email into user_email
  from auth.users u
  where u.id = uid;

  if user_email is null or length(trim(user_email)) = 0 then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  user_email := lower(trim(user_email));

  select * into m
  from public.members
  where auth_user_id = uid;

  if not found then
    select * into m
    from public.members
    where lower(email) = user_email
      and auth_user_id is null
    order by created_at asc
    limit 1;

    if found then
      update public.members
      set auth_user_id = uid
      where member_id = m.member_id
      returning * into m;
    end if;
  end if;

  if not found then
    new_household_id := replace(gen_random_uuid()::text, '-', '');
    new_member_id := replace(gen_random_uuid()::text, '-', '');
    home_name := split_part(user_email, '@', 1);
    if home_name is null or length(home_name) = 0 then
      home_name := 'Home';
    end if;

    insert into public.households (household_id, name, created_at)
    values (new_household_id, home_name, now())
    returning * into h;

    insert into public.members (
      member_id,
      household_id,
      email,
      auth_user_id,
      created_at
    )
    values (
      new_member_id,
      new_household_id,
      user_email,
      uid,
      now()
    )
    returning * into m;
  else
    select * into h
    from public.households
    where household_id = m.household_id;
  end if;

  return json_build_object(
    'member_id', m.member_id,
    'household_id', m.household_id,
    'email', m.email,
    'household_name', coalesce(h.name, 'Home')
  );
end;
$$;

-- Second layer: a future permissive policy still cannot see rows early.
do $$
declare
  t text;
begin
  foreach t in array array[
    'households',
    'members',
    'mandates',
    'mandate_lines',
    'agent_credentials',
    'quotes',
    'orders',
    'order_events',
    'evidence',
    'receipts',
    'list_lines',
    'fulfillment_jobs',
    'shipment_events',
    'return_requests',
    'household_nudge_settings',
    'reorder_nudges'
  ]
  loop
    execute format('drop policy if exists email_2fa_required on public.%I', t);
    execute format(
      'create policy email_2fa_required on public.%I as restrictive for all to authenticated using (public.email_2fa_ok()) with check (public.email_2fa_ok())',
      t
    );
  end loop;
end $$;
