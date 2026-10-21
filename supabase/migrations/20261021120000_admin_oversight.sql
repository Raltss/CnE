-- Admin oversight and audited staff access.
--
-- 1. Admins can READ everyone's work: clients, products, packages (and through
--    them submissions and activity), and attendance. They still can't create,
--    edit, review, submit or clock in: the workflow functions check for the
--    manager or editor role, and API users can't write the tables at all.
-- 2. Every change to an account's role, access, name or title is written to
--    public.staff_activity, attributed to the signed-in admin who made it
--    (auth.uid()). Changes made from the SQL editor have no signed-in user and
--    are recorded as a trusted setup step.
-- 3. Admins change access only through the functions below (approve, change
--    role, deactivate, reactivate). Direct updates of public.profiles through
--    the API are revoked. Admin access itself is granted only in the SQL editor
--    (supabase/scripts/first-admin.sql or private.approve_staff).

-- ── Admins read all work (read-only) ────────────────────────────────────────

create policy "Admins read clients"
  on public.clients for select to authenticated
  using ((select private.has_role('admin')));

create policy "Admins read products"
  on public.products for select to authenticated
  using ((select private.has_role('admin')));

-- Submissions and activity follow package visibility, so admins see them too.
create policy "Admins read all packages"
  on public.packages for select to authenticated
  using ((select private.has_role('admin')));

create policy "Admins read all attendance"
  on public.attendance_sessions for select to authenticated
  using ((select private.has_role('admin')));

-- ── Account history ─────────────────────────────────────────────────────────

create type public.staff_change_type as enum (
  'account_created', 'approved', 'role_changed', 'deactivated', 'reactivated', 'details_changed'
);

create table public.staff_activity (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- The signed-in admin who made the change. Null means a trusted setup step:
  -- the SQL editor, the service role, or the automatic profile for a new user.
  actor_id uuid references public.profiles (id),
  type public.staff_change_type not null,
  old_role public.app_role,
  new_role public.app_role,
  old_is_active boolean,
  new_is_active boolean,
  message text not null,
  at timestamptz not null default now()
);

comment on table public.staff_activity is 'Audit history of account access changes. Written only by a trigger on public.profiles.';

create index staff_activity_profile_idx on public.staff_activity (profile_id, at desc);
create index staff_activity_at_idx on public.staff_activity (at desc);

create function private.audit_profile_changes()
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
      new.id, actor, 'account_created', new.role, new.is_active,
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

create trigger audit_profile_changes
  after insert or update on public.profiles
  for each row execute function private.audit_profile_changes();

-- Accounts that already exist start their history here.
insert into public.staff_activity (profile_id, actor_id, type, new_role, new_is_active, message)
select
  p.id, null, 'account_created', p.role, p.is_active,
  'Account history started (' || coalesce(initcap(p.role::text), 'no role') || ', '
    || case when p.is_active then 'active' else 'inactive' end || ')'
from public.profiles p;

alter table public.staff_activity enable row level security;

create policy "Admins read account history"
  on public.staff_activity for select to authenticated
  using ((select private.has_role('admin')));

revoke all on public.staff_activity from anon;
revoke insert, update, delete, truncate, references, trigger on public.staff_activity from authenticated;
grant select on public.staff_activity to authenticated;

-- ── Profiles change only through the audited functions ─────────────────────
-- Replaces the direct-update path from the first migration. The guard trigger
-- (no self changes, admins only) still runs inside every function below.

drop policy "Admins update other staff" on public.profiles;
-- Revoking the table privilege also revokes the column privileges granted before.
revoke update on public.profiles from authenticated;

-- ── Staff access functions (admins, through the app) ───────────────────────

-- Admins hand out manager and editor access; admin access stays in the SQL editor.
create function private.check_assignable_role(wanted public.app_role)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if wanted is null or wanted not in ('manager', 'editor') then
    raise exception 'Choose manager or editor. Admin access can only be granted in the Supabase SQL editor.' using errcode = '22023';
  end if;
end;
$$;

-- Locks the account for the rest of the transaction and applies the shared rules.
create function private.lock_staff_target(target uuid, actor uuid)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  person public.profiles;
begin
  select * into person from public.profiles where id = target for update;
  if person.id is null then
    raise exception 'This account no longer exists.' using errcode = 'P0002';
  end if;
  if person.id = actor then
    raise exception 'You can’t change your own role or access.' using errcode = '42501';
  end if;
  if person.role = 'admin' then
    raise exception 'Admin accounts are managed in the Supabase SQL editor, not in the app.' using errcode = '42501';
  end if;
  return person;
end;
$$;

-- Packages someone still holds: anything not completed, cancelled or archived.
create function private.open_package_count(person uuid, as_role public.app_role)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.packages p
  where p.status not in ('completed', 'cancelled', 'archived')
    and case when as_role = 'editor' then p.editor_id = person else p.responsible_manager_id = person end
$$;

create function private.plural(n integer, singular text, plural text)
returns text
language sql
immutable
set search_path = ''
as $$
  select n || ' ' || case when n = 1 then singular else plural end
$$;

create function public.approve_account(p_profile_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_role('admin', 'approve accounts');
  person public.profiles;
begin
  perform private.check_assignable_role(p_role);
  person := private.lock_staff_target(p_profile_id, actor);
  if person.role is not null then
    raise exception '% already has a role. Use Change role instead.', person.full_name using errcode = '22023';
  end if;
  update public.profiles set role = p_role, is_active = true where id = person.id;
end;
$$;

create function public.change_staff_role(p_profile_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_role('admin', 'change roles');
  person public.profiles;
  open_work integer;
  owned integer;
begin
  perform private.check_assignable_role(p_role);
  person := private.lock_staff_target(p_profile_id, actor);
  if person.role is null then
    raise exception 'Approve this account before changing its role.' using errcode = '22023';
  end if;
  if person.role = p_role then
    raise exception '% is already %.', person.full_name,
      case p_role when 'editor' then 'an editor' else 'a manager' end using errcode = '22023';
  end if;

  open_work := private.open_package_count(person.id, person.role);
  if open_work > 0 and person.role = 'editor' then
    raise exception 'Reassign %’s % to another editor first.', person.full_name,
      private.plural(open_work, 'open package', 'open packages') using errcode = '22023';
  elsif open_work > 0 then
    raise exception 'Make another manager responsible for %’s % first.', person.full_name,
      private.plural(open_work, 'open package', 'open packages') using errcode = '22023';
  end if;
  if person.role = 'manager' then
    select (select count(*) from public.clients where manager_id = person.id)
      + (select count(*) from public.products where manager_id = person.id)
    into owned;
    if owned > 0 then
      raise exception '% is the assigned manager for %. Assign another manager to them first.', person.full_name,
        private.plural(owned, 'client or product', 'clients and products') using errcode = '22023';
    end if;
  end if;

  update public.profiles set role = p_role where id = person.id;
end;
$$;

-- Access ends at once; packages, rounds, attendance and history stay.
create function public.deactivate_account(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_role('admin', 'deactivate accounts');
  person public.profiles := private.lock_staff_target(p_profile_id, actor);
begin
  if not person.is_active then
    raise exception '% isn’t active.', person.full_name using errcode = '22023';
  end if;
  update public.profiles set is_active = false where id = person.id;
end;
$$;

create function public.reactivate_account(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_role('admin', 'reactivate accounts');
  person public.profiles := private.lock_staff_target(p_profile_id, actor);
begin
  if person.role is null then
    raise exception 'This account has never been approved. Approve it instead.' using errcode = '22023';
  end if;
  if person.is_active then
    raise exception '% is already active.', person.full_name using errcode = '22023';
  end if;
  update public.profiles set is_active = true where id = person.id;
end;
$$;

revoke all on function private.audit_profile_changes() from public;
revoke all on function private.check_assignable_role(public.app_role) from public;
revoke all on function private.lock_staff_target(uuid, uuid) from public;
revoke all on function private.open_package_count(uuid, public.app_role) from public;
revoke all on function private.plural(integer, text, text) from public;

revoke all on function public.approve_account(uuid, public.app_role) from public, anon;
revoke all on function public.change_staff_role(uuid, public.app_role) from public, anon;
revoke all on function public.deactivate_account(uuid) from public, anon;
revoke all on function public.reactivate_account(uuid) from public, anon;

grant execute on function public.approve_account(uuid, public.app_role) to authenticated;
grant execute on function public.change_staff_role(uuid, public.app_role) to authenticated;
grant execute on function public.deactivate_account(uuid) to authenticated;
grant execute on function public.reactivate_account(uuid) to authenticated;
