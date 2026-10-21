-- Makes one existing Auth user the first active admin (do this once per project).
--
-- The app can't do this: only an admin may change roles, and nobody may change
-- their own. Run it in Supabase Dashboard → SQL Editor as the default "postgres"
-- role (don't impersonate a user). Edit the email in BOTH places below first.
-- Safe to rerun: an existing profile keeps its name, title, and email; only
-- role and is_active are set.

begin;

do $$
declare
  owner_email constant text := 'owner@example.com';  -- ← change me
  matches integer;
  owner_id uuid;
  result public.profiles;
begin
  if to_regclass('public.profiles') is null then
    raise exception 'public.profiles doesn’t exist. Apply the migrations first (docs/supabase-setup.md, step 3).';
  end if;

  select count(*) into matches from auth.users u where lower(u.email) = lower(trim(owner_email));
  if matches = 0 then
    raise exception 'No Auth user has the email %. Create it under Authentication → Users first.', owner_email;
  elsif matches > 1 then
    raise exception 'More than one Auth user has the email %. Resolve that before continuing.', owner_email;
  end if;
  select u.id into owner_id from auth.users u where lower(u.email) = lower(trim(owner_email));

  -- Same defaults as private.handle_new_user() when the profile is missing.
  insert into public.profiles (id, email, full_name, role, is_active)
  select u.id,
         coalesce(u.email, ''),
         coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(u.email, ''), '@', 1)),
         'admin',
         true
  from auth.users u
  where u.id = owner_id
  on conflict (id) do update set role = 'admin', is_active = true
  returning * into result;

  if result.role is distinct from 'admin' or not result.is_active then
    raise exception 'Profile % wasn’t activated as admin.', owner_id;
  end if;
  raise notice 'Admin ready: % (%)', result.email, result.id;
end
$$;

commit;

select id, email, full_name, title, role, is_active, updated_at
from public.profiles
where lower(email) = lower('owner@example.com');  -- ← change me
