-- v1 fixes found by running against real Supabase Auth (GoTrue v2.197) instead of a stand-in.
--
-- 1. Accounts added in the app (create-staff-account) didn't get the "choose your own
--    password" prompt, and "Account created" had no actor. Supabase Auth's admin
--    createUser inserts the auth.users row first and writes app_metadata (created_by,
--    must_change_password) in a second UPDATE, so private.handle_new_user() and the
--    history trigger, which run on INSERT, never saw them. A trigger on that UPDATE now
--    applies both. A one-time backfill fixes accounts already added this way.
-- 2. Two clock-ins at the same moment: the unique index already allowed only one open
--    session, but the other request saw a raw constraint error. It now gets the usual
--    "You're already clocked in" message.
--
-- No rows are deleted. Existing sessions, packages, rounds, and history are unchanged,
-- except the backfill below (a flag on profiles and the actor on "Account created").

-- ── 1. app_metadata written after the account row ──────────────────────────

create function private.handle_user_app_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only when the flag is first set: later writes of the same metadata (e.g. on sign-in)
  -- must not bring the prompt back after the person chose their own password.
  if coalesce(new.raw_app_meta_data ->> 'must_change_password', '') = 'true'
     and coalesce(old.raw_app_meta_data ->> 'must_change_password', '') <> 'true' then
    update public.profiles set must_change_password = true where id = new.id;
  end if;
  -- Fills in who added the account, if app_metadata names an active admin (account_creator checks).
  if new.raw_app_meta_data ->> 'created_by' is distinct from old.raw_app_meta_data ->> 'created_by' then
    update public.staff_activity
    set actor_id = private.account_creator(new.id)
    where profile_id = new.id and type = 'account_created' and actor_id is null;
  end if;
  return null;
end;
$$;

revoke all on function private.handle_user_app_metadata() from public;

create trigger on_auth_user_app_metadata
  after update of raw_app_meta_data on auth.users
  for each row execute function private.handle_user_app_metadata();

-- Backfill: people added in the app who haven't chosen their own password yet (no
-- password change of their own in the account history) are asked to at next sign-in.
update public.profiles p
set must_change_password = true
from auth.users u
where u.id = p.id
  and u.raw_app_meta_data ->> 'must_change_password' = 'true'
  and not p.must_change_password
  and not exists (
    select 1 from public.staff_activity a
    where a.profile_id = p.id and a.actor_id = p.id and a.type = 'details_changed'
  );

-- Backfill: "Account created" for accounts added in the app names the admin who added them.
update public.staff_activity a
set actor_id = private.account_creator(a.profile_id)
where a.type = 'account_created'
  and a.actor_id is null
  and private.account_creator(a.profile_id) is not null;

-- ── 2. Clock in: friendly message when two requests race ────────────────────
-- Same as in 20261021100200_workflow_functions.sql, plus the unique_violation handler.

create or replace function public.clock_in()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  open_session public.attendance_sessions;
  new_id uuid;
begin
  if not private.is_work_staff() then
    raise exception 'Only managers and editors clock in.' using errcode = '42501';
  end if;
  perform public.close_stale_sessions();
  select * into open_session from public.attendance_sessions where person_id = actor and clock_out is null for update;
  if open_session.id is not null then
    raise exception 'You’re already clocked in since %.', private.format_manila(open_session.clock_in) using errcode = '22023';
  end if;
  insert into public.attendance_sessions (person_id) values (actor) returning id into new_id;
  return new_id;
exception
  -- attendance_one_open_session: another request clocked in at the same moment.
  when unique_violation then
    raise exception 'You’re already clocked in.' using errcode = '22023';
end;
$$;
