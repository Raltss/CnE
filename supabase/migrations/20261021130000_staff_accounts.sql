-- Accounts an admin adds in the app, and people choosing their own password.
--
-- The create-staff-account Edge Function (supabase/functions) creates the Auth
-- user with the service role and stores two facts in app_metadata, which only
-- the service role can set:
--   created_by            the admin who added them (for the account history)
--   must_change_password  true: they choose their own password at first sign-in
-- The role is then granted through approve_account() with the admin's own
-- token, so the usual checks and the account history apply. Accounts created
-- in the Supabase Dashboard work as before.

alter table public.profiles add column must_change_password boolean not null default false;

comment on column public.profiles.must_change_password is
  'True for accounts an admin added with a temporary password, until the person chooses their own.';

-- Same as before, plus the job title from user metadata and the temporary-password flag.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, title, must_change_password)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, ''), '@', 1)),
    left(coalesce(trim(new.raw_user_meta_data ->> 'title'), ''), 80),
    coalesce(new.raw_app_meta_data ->> 'must_change_password' = 'true', false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- The admin who added an account in the app, if app_metadata names an active admin.
create function private.account_creator(profile uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claimed text;
begin
  select u.raw_app_meta_data ->> 'created_by' into claimed from auth.users u where u.id = profile;
  if claimed is null or claimed !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return (select p.id from public.profiles p where p.id = claimed::uuid and p.role = 'admin' and p.is_active);
end;
$$;

-- Same as in 20261021120000_admin_oversight.sql, except that a new account
-- added through the Edge Function is attributed to the admin who added it.
create or replace function private.audit_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  kind public.staff_change_type;
  body text;
  details text[] := '{}';
begin
  if tg_op = 'INSERT' then
    insert into public.staff_activity (profile_id, actor_id, type, new_role, new_is_active, message)
    values (
      new.id, coalesce(actor, private.account_creator(new.id)), 'account_created', new.role, new.is_active,
      case
        when new.role is null then 'Account created, waiting for approval'
        else 'Account created as ' || initcap(new.role::text) || case when new.is_active then '' else ' (inactive)' end
      end
    );
    return null;
  end if;

  if new.role is distinct from old.role or new.is_active is distinct from old.is_active then
    if old.role is null and new.role is not null then
      kind := 'approved';
      body := 'Approved as ' || initcap(new.role::text) || case when new.is_active then '' else ' (not active yet)' end;
    elsif old.is_active and not new.is_active then
      kind := 'deactivated';
      body := 'Deactivated' || case
        when new.role is distinct from old.role
          then ', and role changed from ' || initcap(old.role::text) || ' to ' || coalesce(initcap(new.role::text), 'no role')
        else ''
      end;
    elsif new.is_active and not old.is_active then
      kind := 'reactivated';
      body := 'Reactivated as ' || initcap(new.role::text) || case
        when new.role is distinct from old.role then ' (was ' || initcap(old.role::text) || ')'
        else ''
      end;
    else
      kind := 'role_changed';
      body := 'Role changed from ' || coalesce(initcap(old.role::text), 'no role') || ' to '
        || coalesce(initcap(new.role::text), 'no role');
    end if;
    insert into public.staff_activity (profile_id, actor_id, type, old_role, new_role, old_is_active, new_is_active, message)
    values (new.id, actor, kind, old.role, new.role, old.is_active, new.is_active, body);
  end if;

  if new.full_name is distinct from old.full_name then
    details := array_append(details, 'name from “' || old.full_name || '” to “' || new.full_name || '”');
  end if;
  if new.title is distinct from old.title then
    details := array_append(details,
      'title from “' || coalesce(nullif(old.title, ''), 'none') || '” to “' || coalesce(nullif(new.title, ''), 'none') || '”');
  end if;
  if new.email is distinct from old.email then
    details := array_append(details, 'email from ' || old.email || ' to ' || new.email);
  end if;
  if cardinality(details) > 0 then
    insert into public.staff_activity (profile_id, actor_id, type, old_role, new_role, old_is_active, new_is_active, message)
    values (new.id, actor, 'details_changed', old.role, new.role, old.is_active, new.is_active,
      'Changed ' || array_to_string(details, '; '));
  end if;
  return null;
end;
$$;

-- Called by the app right after Supabase Auth accepted the person's new
-- password. It clears the "choose your own password" prompt and records the
-- change. It is a prompt, not a lock: the password itself lives in Supabase Auth.
create function public.complete_password_change()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  was_temporary boolean;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select must_change_password into was_temporary from public.profiles where id = me for update;
  if not found then
    raise exception 'This account has no profile.' using errcode = 'P0002';
  end if;
  update public.profiles set must_change_password = false where id = me;
  insert into public.staff_activity (profile_id, actor_id, type, message)
  values (me, me, 'details_changed',
    case when was_temporary then 'Replaced the temporary password with their own' else 'Changed their password' end);
end;
$$;

revoke all on function private.account_creator(uuid) from public;
revoke all on function public.complete_password_change() from public, anon;
grant execute on function public.complete_password_change() to authenticated;
