-- Staff accounts, application roles, and the access helpers every RLS policy uses.
--
-- Sign-in is Supabase Auth email + password. There is no public sign-up: a
-- trusted admin creates users in the Supabase Dashboard, then approves them
-- with private.approve_staff() from the SQL editor (docs/supabase-setup.md).
-- Google OAuth is a planned future addition and isn't required here.

create type public.app_role as enum ('admin', 'manager', 'editor');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null,
  title text not null default '',
  -- Null until a trusted admin assigns a role. No role means no access.
  role public.app_role,
  -- New accounts start inactive. Deactivated staff keep their history but lose access.
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_active_needs_role check (not is_active or role is not null)
);

comment on table public.profiles is 'One row per staff account. Role and is_active are set only by a trusted admin.';

-- ── Access helpers ──────────────────────────────────────────────────────────
-- Kept in a schema the Data API doesn't expose. SECURITY DEFINER lets policies
-- read profiles without recursing into the profiles policies themselves.

create schema private;

create function private.current_staff_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid()) and p.is_active
$$;

comment on function private.current_staff_role() is 'Role of the signed-in user, or null when they are not approved, active staff.';

create function private.has_role(wanted public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_staff_role() = wanted, false)
$$;

create function private.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_staff_role() is not null
$$;

-- Managers and editors do the package and attendance work; admins only manage staff.
create function private.is_work_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_staff_role() in ('manager', 'editor'), false)
$$;

revoke all on function private.current_staff_role() from public;
revoke all on function private.has_role(public.app_role) from public;
revoke all on function private.is_active_staff() from public;
revoke all on function private.is_work_staff() from public;
grant usage on schema private to authenticated, service_role;
grant execute on function private.current_staff_role() to authenticated;
grant execute on function private.has_role(public.app_role) to authenticated;
grant execute on function private.is_active_staff() to authenticated;
grant execute on function private.is_work_staff() to authenticated;

-- ── New users get an inactive profile ──────────────────────────────────────

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Accounts that existed before this migration get an (inactive) profile too.
insert into public.profiles (id, email, full_name)
select u.id, coalesce(u.email, ''), split_part(coalesce(u.email, ''), '@', 1)
from auth.users u
on conflict (id) do nothing;

-- ── Nobody changes their own role or access ────────────────────────────────

create function private.guard_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  -- Trusted contexts (the SQL editor, the service role) have no signed-in user.
  if actor is not null then
    if new.id <> old.id or new.email <> old.email then
      raise exception 'A profile’s id and email can’t be changed here.' using errcode = '42501';
    end if;
    if new.role is distinct from old.role or new.is_active is distinct from old.is_active then
      if old.id = actor then
        raise exception 'You can’t change your own role or access.' using errcode = '42501';
      end if;
      if not private.has_role('admin') then
        raise exception 'Only an admin can change roles or access.' using errcode = '42501';
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger guard_profile_changes
  before update on public.profiles
  for each row execute function private.guard_profile_changes();

-- ── Row Level Security ──────────────────────────────────────────────────────

alter table public.profiles enable row level security;

-- Active staff see every profile (names appear in history). Anyone signed in
-- sees their own row, so the app can explain "waiting for approval".
create policy "Staff can read profiles"
  on public.profiles for select to authenticated
  using ((select private.is_active_staff()) or id = (select auth.uid()));

-- Admins manage other people's accounts, never their own.
create policy "Admins update other staff"
  on public.profiles for update to authenticated
  using ((select private.has_role('admin')) and id <> (select auth.uid()))
  with check ((select private.has_role('admin')) and id <> (select auth.uid()));

revoke all on public.profiles from anon;
revoke insert, update, delete, truncate, references, trigger on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, title, role, is_active) on public.profiles to authenticated;

-- ── Trusted admin setup (SQL editor only) ──────────────────────────────────
-- Not callable through the API: only the database owner (the Dashboard SQL
-- editor) or the service role may run these.

create function private.approve_staff(
  staff_email text,
  staff_role public.app_role,
  staff_full_name text default null,
  staff_title text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  approved public.profiles;
begin
  update public.profiles
  set role = staff_role,
      is_active = true,
      full_name = coalesce(nullif(trim(staff_full_name), ''), full_name),
      title = coalesce(staff_title, title)
  where lower(email) = lower(trim(staff_email))
  returning * into approved;
  if approved.id is null then
    raise exception 'No account uses %. Create the user under Authentication → Users first.', staff_email;
  end if;
  return approved;
end;
$$;

create function private.deactivate_staff(staff_email text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  deactivated public.profiles;
begin
  update public.profiles
  set is_active = false
  where lower(email) = lower(trim(staff_email))
  returning * into deactivated;
  if deactivated.id is null then
    raise exception 'No account uses %.', staff_email;
  end if;
  return deactivated;
end;
$$;

revoke all on function private.approve_staff(text, public.app_role, text, text) from public, authenticated;
revoke all on function private.deactivate_staff(text) from public, authenticated;
grant execute on function private.approve_staff(text, public.app_role, text, text) to service_role;
grant execute on function private.deactivate_staff(text) to service_role;
