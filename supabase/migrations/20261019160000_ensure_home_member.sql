-- Household Auth bootstrap: link auth.users → members.auth_user_id.
-- Callable with the anon key + signed-in JWT (no service_role in apps/web).
-- Creates a household + member on first sign-in when none exists for the email.

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

revoke all on function public.ensure_home_member() from public;
grant execute on function public.ensure_home_member() to authenticated;

comment on function public.ensure_home_member() is
  'Idempotent Auth bootstrap for /home: link or create members.auth_user_id = auth.uid().';
