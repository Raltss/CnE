-- Workflow commands, called from the app with supabase.rpc(...).
--
-- Each function mirrors a command in src/data/workflow.ts: it checks the
-- caller's role and the package's status, makes every change in one
-- transaction, and writes the activity history and notifications. They run as
-- SECURITY DEFINER because the tables are read-only to API users; the checks
-- inside each function are what enforce the permission matrix.

-- ── Internal helpers ────────────────────────────────────────────────────────

-- The signed-in user's id, if they are approved, active staff with this role.
create function private.require_role(wanted public.app_role, action text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_role(wanted) then
    raise exception 'Only %s can %.', wanted::text, action using errcode = '42501';
  end if;
  return (select auth.uid());
end;
$$;

create function private.person_name(person uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select full_name from public.profiles where id = person), 'Unknown')
$$;

-- Same format as formatDateTime() in src/lib/time.ts, e.g. "Oct 21, 2026, 3:22 PM PHT".
create function private.format_manila(instant timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(instant at time zone 'Asia/Manila', 'Mon FMDD, YYYY, FMHH12:MI AM') || ' PHT'
$$;

-- Same rule as isHttpUrl() in src/data/validation.ts.
create function private.is_http_url(link text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select link ~* '^https?://[^/?#[:space:]]*\.[^/?#[:space:]]+([/?#][^[:space:]]*)?$'
$$;

create function private.log_activity(pkg uuid, kind public.activity_type, actor uuid, body text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity (package_id, type, actor_id, message) values (pkg, kind, actor, body)
$$;

-- People are never notified about their own actions.
create function private.notify(recipient uuid, kind public.notification_type, pkg uuid, actor uuid, body text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (recipient_id, type, package_id, actor_id, message)
  select recipient, kind, pkg, actor, body
  where recipient is distinct from actor
$$;

-- Trimmed, non-empty links in their original order.
create function private.clean_links(links text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(trim(l) order by n) filter (where trim(l) <> ''), '{}')
  from unnest(coalesce(links, '{}')) with ordinality as t(l, n)
$$;

-- Mirrors validatePackageInput() in src/data/validation.ts.
create function private.validate_package(
  p_title text,
  p_client_id uuid,
  p_product_id uuid,
  p_brief_link text,
  p_reference_links text[],
  p_editor_id uuid,
  p_responsible_manager_id uuid,
  p_deadline timestamptz,
  p_previous_deadline timestamptz
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link text;
begin
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Title is required.' using errcode = '22023';
  elsif char_length(trim(p_title)) > 120 then
    raise exception 'Keep the title under 120 characters.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.clients where id = p_client_id) then
    raise exception 'Choose a client.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.products where id = p_product_id and client_id = p_client_id) then
    raise exception 'Choose a product that belongs to this client.' using errcode = '22023';
  end if;
  if coalesce(trim(p_brief_link), '') <> '' and not private.is_http_url(trim(p_brief_link)) then
    raise exception 'The brief link must be a full link starting with https://' using errcode = '22023';
  end if;
  foreach link in array coalesce(p_reference_links, '{}') loop
    if trim(link) <> '' and not private.is_http_url(trim(link)) then
      raise exception 'Each reference link must be a full link starting with https://' using errcode = '22023';
    end if;
  end loop;
  if not exists (select 1 from public.profiles where id = p_editor_id and role = 'editor' and is_active) then
    raise exception 'Choose an active editor for this package.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_responsible_manager_id and role = 'manager' and is_active) then
    raise exception 'Choose an active responsible manager.' using errcode = '22023';
  end if;
  if p_deadline is null then
    raise exception 'Set the final deadline.' using errcode = '22023';
  elsif p_deadline is distinct from p_previous_deadline and p_deadline <= now() then
    raise exception 'The deadline must be in the future.' using errcode = '22023';
  end if;
end;
$$;

-- Locks the package row for the rest of the transaction.
create function private.lock_package(package_id uuid)
returns public.packages
language plpgsql
security definer
set search_path = ''
as $$
declare
  pkg public.packages;
begin
  select * into pkg from public.packages where id = package_id for update;
  if pkg.id is null then
    raise exception 'This package no longer exists.' using errcode = 'P0002';
  end if;
  return pkg;
end;
$$;

-- ── Packages ────────────────────────────────────────────────────────────────

create function public.create_package(
  p_title text,
  p_client_id uuid,
  p_product_id uuid,
  p_description text,
  p_brief_link text,
  p_reference_links text[],
  p_deliverables text,
  p_editor_id uuid,
  p_responsible_manager_id uuid,
  p_deadline timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_role('manager', 'create packages');
  pkg public.packages;
begin
  perform private.validate_package(
    p_title, p_client_id, p_product_id, p_brief_link, p_reference_links, p_editor_id, p_responsible_manager_id, p_deadline, null
  );
  insert into public.packages (
    title, client_id, product_id, description, brief_link, reference_links, deliverables,
    editor_id, responsible_manager_id, deadline, created_by
  )
  values (
    trim(p_title), p_client_id, p_product_id, coalesce(trim(p_description), ''), coalesce(trim(p_brief_link), ''),
    private.clean_links(p_reference_links), coalesce(trim(p_deliverables), ''),
    p_editor_id, p_responsible_manager_id, p_deadline, actor
  )
  returning * into pkg;

  perform private.log_activity(pkg.id, 'created', actor, 'Created and assigned to ' || private.person_name(pkg.editor_id));
  perform private.notify(pkg.editor_id, 'assigned', pkg.id, actor, 'New package assigned: ' || pkg.title);
  return pkg.id;
end;
$$;

create function public.update_package(
  p_package_id uuid,
  p_title text,
  p_client_id uuid,
  p_product_id uuid,
  p_description text,
  p_brief_link text,
  p_reference_links text[],
  p_deliverables text,
  p_editor_id uuid,
  p_responsible_manager_id uuid,
  p_deadline timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_role('manager', 'edit packages');
  previous public.packages;
  pkg public.packages;
  changed text[] := '{}';
begin
  previous := private.lock_package(p_package_id);
  if previous.status = 'completed' then
    raise exception 'Completed packages can’t be edited in this milestone.' using errcode = '22023';
  end if;
  perform private.validate_package(
    p_title, p_client_id, p_product_id, p_brief_link, p_reference_links, p_editor_id, p_responsible_manager_id, p_deadline,
    previous.deadline
  );

  update public.packages
  set title = trim(p_title),
      client_id = p_client_id,
      product_id = p_product_id,
      description = coalesce(trim(p_description), ''),
      brief_link = coalesce(trim(p_brief_link), ''),
      reference_links = private.clean_links(p_reference_links),
      deliverables = coalesce(trim(p_deliverables), ''),
      editor_id = p_editor_id,
      responsible_manager_id = p_responsible_manager_id,
      deadline = p_deadline,
      updated_at = now()
  where id = p_package_id
  returning * into pkg;

  if pkg.title <> previous.title then changed := array_append(changed, 'title'); end if;
  if pkg.client_id <> previous.client_id or pkg.product_id <> previous.product_id then changed := array_append(changed, 'client/product'); end if;
  if pkg.description <> previous.description then changed := array_append(changed, 'description'); end if;
  if pkg.brief_link <> previous.brief_link then changed := array_append(changed, 'brief link'); end if;
  if pkg.reference_links <> previous.reference_links then changed := array_append(changed, 'reference links'); end if;
  if pkg.deliverables <> previous.deliverables then changed := array_append(changed, 'deliverables'); end if;

  if pkg.editor_id <> previous.editor_id then
    perform private.log_activity(pkg.id, 'reassigned', actor,
      'Reassigned from ' || private.person_name(previous.editor_id) || ' to ' || private.person_name(pkg.editor_id));
    perform private.notify(previous.editor_id, 'reassigned_away', pkg.id, actor,
      pkg.title || ' was reassigned to ' || private.person_name(pkg.editor_id));
    perform private.notify(pkg.editor_id, 'assigned', pkg.id, actor, 'Package reassigned to you: ' || pkg.title);
  end if;
  if pkg.deadline <> previous.deadline then
    perform private.log_activity(pkg.id, 'deadline_changed', actor,
      'Deadline changed from ' || private.format_manila(previous.deadline) || ' to ' || private.format_manila(pkg.deadline));
    perform private.notify(pkg.editor_id, 'deadline_changed', pkg.id, actor,
      'Deadline for ' || pkg.title || ' is now ' || private.format_manila(pkg.deadline));
  end if;
  if pkg.responsible_manager_id <> previous.responsible_manager_id then
    perform private.log_activity(pkg.id, 'manager_changed', actor,
      'Responsible manager changed from ' || private.person_name(previous.responsible_manager_id) || ' to '
        || private.person_name(pkg.responsible_manager_id));
    perform private.notify(pkg.responsible_manager_id, 'manager_changed', pkg.id, actor, 'You are now responsible for ' || pkg.title);
  end if;
  if cardinality(changed) > 0 then
    perform private.log_activity(pkg.id, 'edited', actor, 'Updated ' || array_to_string(changed, ', '));
  end if;
  return pkg.id;
end;
$$;

-- ── Status transitions ──────────────────────────────────────────────────────

create function public.start_work(p_package_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  pkg public.packages := private.lock_package(p_package_id);
begin
  if not private.has_role('editor') or pkg.editor_id <> actor then
    raise exception 'Only the assigned editor can start this package.' using errcode = '42501';
  end if;
  if pkg.status <> 'assigned' then
    raise exception 'Work has already started on this package.' using errcode = '22023';
  end if;
  update public.packages set status = 'in_progress', updated_at = now() where id = pkg.id;
  perform private.log_activity(pkg.id, 'started', actor, 'Started work');
end;
$$;

create function public.submit_for_review(p_package_id uuid, p_review_link text, p_delivery_link text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  pkg public.packages := private.lock_package(p_package_id);
  review text := nullif(trim(coalesce(p_review_link, '')), '');
  delivery text := nullif(trim(coalesce(p_delivery_link, '')), '');
  next_round integer;
  was_feedback boolean;
begin
  if not private.has_role('editor') or pkg.editor_id <> actor then
    raise exception 'Only the assigned editor can submit this package.' using errcode = '42501';
  end if;
  if pkg.status not in ('in_progress', 'apply_feedback') then
    if pkg.status = 'assigned' then
      raise exception 'Start work before submitting.' using errcode = '22023';
    end if;
    raise exception 'This package isn’t waiting for a submission.' using errcode = '22023';
  end if;
  if review is null and delivery is null then
    raise exception 'Add a review link, a delivery link, or both.' using errcode = '22023';
  end if;
  if (review is not null and not private.is_http_url(review)) or (delivery is not null and not private.is_http_url(delivery)) then
    raise exception 'Enter a full link starting with https://' using errcode = '22023';
  end if;

  select coalesce(max(round), 0) + 1 into next_round from public.submissions where package_id = pkg.id;
  insert into public.submissions (package_id, round, review_link, delivery_link, submitted_by)
  values (pkg.id, next_round, review, delivery, actor);

  was_feedback := pkg.status = 'apply_feedback';
  update public.packages set status = 'submitted', updated_at = now() where id = pkg.id;
  perform private.log_activity(pkg.id, 'submitted', actor,
    case when was_feedback then 'Resubmitted' else 'Submitted' end || ' Round ' || next_round || ' for review');
  perform private.notify(pkg.responsible_manager_id, 'submitted', pkg.id, actor,
    private.person_name(actor) || case when was_feedback then ' resubmitted ' else ' submitted ' end
      || pkg.title || ' (Round ' || next_round || ')');
  return next_round;
end;
$$;

create function public.request_feedback(p_package_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_role('manager', 'request feedback changes');
  pkg public.packages := private.lock_package(p_package_id);
  note text := nullif(trim(coalesce(p_note, '')), '');
  latest public.submissions;
begin
  if pkg.status <> 'submitted' then
    raise exception 'Only submitted packages can be sent back for changes.' using errcode = '22023';
  end if;
  if char_length(note) > 500 then
    raise exception 'Keep the note under 500 characters.' using errcode = '22023';
  end if;
  select * into latest from public.submissions where package_id = pkg.id order by round desc limit 1;
  update public.submissions
  set outcome = 'feedback', decided_at = now(), decided_by = actor, feedback_note = note
  where id = latest.id;
  update public.packages set status = 'apply_feedback', updated_at = now() where id = pkg.id;
  perform private.log_activity(pkg.id, 'feedback', actor, 'Marked Apply Feedback on Round ' || coalesce(latest.round::text, '?'));
  perform private.notify(pkg.editor_id, 'feedback', pkg.id, actor, 'Feedback changes requested on ' || pkg.title);
end;
$$;

-- PRD default: a round can only be approved when it has a delivery link.
create function public.approve_package(p_package_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_role('manager', 'approve packages');
  pkg public.packages := private.lock_package(p_package_id);
  latest public.submissions;
begin
  if pkg.status <> 'submitted' then
    raise exception 'Only submitted packages can be approved.' using errcode = '22023';
  end if;
  select * into latest from public.submissions where package_id = pkg.id order by round desc limit 1;
  if latest.delivery_link is null then
    raise exception 'This round has no delivery link. Mark Apply Feedback so the editor can resubmit with one.' using errcode = '22023';
  end if;
  update public.submissions set outcome = 'approved', decided_at = now(), decided_by = actor where id = latest.id;
  update public.packages set status = 'completed', completed_at = now(), updated_at = now() where id = pkg.id;
  perform private.log_activity(pkg.id, 'approved', actor, 'Approved Round ' || latest.round || '. Package completed');
  perform private.notify(pkg.editor_id, 'approved', pkg.id, actor, pkg.title || ' was approved');
end;
$$;

-- ── Attendance ──────────────────────────────────────────────────────────────

-- Close sessions left open past 16 hours at clock-in + 16h and flag them.
-- Runs before every clock action and periodically from the app.
create function public.close_stale_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed integer;
begin
  if not private.is_active_staff() then
    raise exception 'Only active staff can do this.' using errcode = '42501';
  end if;
  update public.attendance_sessions
  set clock_out = clock_in + interval '16 hours', auto_closed = true
  where clock_out is null and clock_in + interval '16 hours' <= now();
  get diagnostics closed = row_count;
  return closed;
end;
$$;

create function public.clock_in()
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
end;
$$;

create function public.clock_out()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if not private.is_work_staff() then
    raise exception 'Only managers and editors clock out.' using errcode = '42501';
  end if;
  perform public.close_stale_sessions();
  update public.attendance_sessions set clock_out = now() where person_id = actor and clock_out is null;
  if not found then
    raise exception 'You aren’t clocked in.' using errcode = '22023';
  end if;
end;
$$;

-- ── Notifications ───────────────────────────────────────────────────────────

create function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_staff() then
    raise exception 'Only active staff can do this.' using errcode = '42501';
  end if;
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id and recipient_id = (select auth.uid());
  if not found then
    raise exception 'Notification not found.' using errcode = 'P0002';
  end if;
end;
$$;

create function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  marked integer;
begin
  if not private.is_active_staff() then
    raise exception 'Only active staff can do this.' using errcode = '42501';
  end if;
  update public.notifications set read_at = now() where recipient_id = (select auth.uid()) and read_at is null;
  get diagnostics marked = row_count;
  return marked;
end;
$$;

-- ── Who may call what ───────────────────────────────────────────────────────
-- Internal helpers aren't callable from the API at all. The commands are
-- callable by signed-in users only; each one re-checks role and status.

revoke all on function private.require_role(public.app_role, text) from public;
revoke all on function private.person_name(uuid) from public;
revoke all on function private.format_manila(timestamptz) from public;
revoke all on function private.is_http_url(text) from public;
revoke all on function private.log_activity(uuid, public.activity_type, uuid, text) from public;
revoke all on function private.notify(uuid, public.notification_type, uuid, uuid, text) from public;
revoke all on function private.clean_links(text[]) from public;
revoke all on function private.validate_package(text, uuid, uuid, text, text[], uuid, uuid, timestamptz, timestamptz) from public;
revoke all on function private.lock_package(uuid) from public;

revoke all on function public.create_package(text, uuid, uuid, text, text, text[], text, uuid, uuid, timestamptz) from public, anon;
revoke all on function public.update_package(uuid, text, uuid, uuid, text, text, text[], text, uuid, uuid, timestamptz) from public, anon;
revoke all on function public.start_work(uuid) from public, anon;
revoke all on function public.submit_for_review(uuid, text, text) from public, anon;
revoke all on function public.request_feedback(uuid, text) from public, anon;
revoke all on function public.approve_package(uuid) from public, anon;
revoke all on function public.close_stale_sessions() from public, anon;
revoke all on function public.clock_in() from public, anon;
revoke all on function public.clock_out() from public, anon;
revoke all on function public.mark_notification_read(uuid) from public, anon;
revoke all on function public.mark_all_notifications_read() from public, anon;

grant execute on function public.create_package(text, uuid, uuid, text, text, text[], text, uuid, uuid, timestamptz) to authenticated;
grant execute on function public.update_package(uuid, text, uuid, uuid, text, text, text[], text, uuid, uuid, timestamptz) to authenticated;
grant execute on function public.start_work(uuid) to authenticated;
grant execute on function public.submit_for_review(uuid, text, text) to authenticated;
grant execute on function public.request_feedback(uuid, text) to authenticated;
grant execute on function public.approve_package(uuid) to authenticated;
grant execute on function public.close_stale_sessions() to authenticated;
grant execute on function public.clock_in() to authenticated;
grant execute on function public.clock_out() to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
