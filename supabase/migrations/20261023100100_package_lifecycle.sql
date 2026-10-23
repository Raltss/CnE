-- Package lifecycle, part 2 (2026-10-23): hold, resume, cancel, archive, unarchive,
-- reopen and delete packages, edit finished packages, and rename products (PRD §5).
--
-- Same pattern as the other workflow functions: managers only, the package row locked
-- for the transaction, every change written to the activity history, and the editor
-- notified. Nothing that has work in it is ever erased: only a package that was never
-- started (Assigned, no rounds) can be deleted; anything else is cancelled and archived.

-- Where Resume (from On Hold) and Unarchive go back to.
alter table public.packages add column previous_status public.package_status;

-- A notice about a deleted package has nothing to link to. The package's other notices
-- are still removed with it (on delete cascade).
alter table public.notifications alter column package_id drop not null;

-- ── Helpers ─────────────────────────────────────────────────────────────────

-- Same labels as STATUS_META in src/lib/status.ts.
create function private.status_label(status public.package_status)
returns text
language sql
immutable
set search_path = ''
as $$
  select case status
    when 'assigned' then 'Assigned'
    when 'in_progress' then 'In Progress'
    when 'submitted' then 'Submitted'
    when 'apply_feedback' then 'Apply Feedback'
    when 'completed' then 'Completed'
    when 'on_hold' then 'On Hold'
    when 'cancelled' then 'Cancelled'
    when 'archived' then 'Archived'
  end
$$;

-- An optional reason or note, trimmed (null when empty). Same limit as the feedback note.
create function private.clean_note(note text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  clean text := nullif(trim(coalesce(note, '')), '');
begin
  if char_length(clean) > 500 then
    raise exception 'Keep the note under 500 characters.' using errcode = '22023';
  end if;
  return clean;
end;
$$;

-- Mirrors validatePackageInput() in src/data/validation.ts. The editor and responsible
-- manager must be active, unless they are unchanged: a finished package may belong to
-- someone who has since been deactivated, and its details can still be corrected.
create function private.validate_package(
  p_title text,
  p_product_id uuid,
  p_brief_link text,
  p_reference_links text[],
  p_editor_id uuid,
  p_responsible_manager_id uuid,
  p_deadline timestamptz,
  p_previous_deadline timestamptz,
  p_previous_editor_id uuid,
  p_previous_manager_id uuid
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
  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'Choose a product.' using errcode = '22023';
  end if;
  if coalesce(trim(p_brief_link), '') <> '' and not private.is_http_url(trim(p_brief_link)) then
    raise exception 'The brief link must be a full link starting with https://' using errcode = '22023';
  end if;
  foreach link in array coalesce(p_reference_links, '{}') loop
    if trim(link) <> '' and not private.is_http_url(trim(link)) then
      raise exception 'Each reference link must be a full link starting with https://' using errcode = '22023';
    end if;
  end loop;
  if not exists (
    select 1 from public.profiles
    where id = p_editor_id and role = 'editor' and (is_active or id = p_previous_editor_id)
  ) then
    raise exception 'Choose an active editor for this package.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_responsible_manager_id and role = 'manager' and (is_active or id = p_previous_manager_id)
  ) then
    raise exception 'Choose an active responsible manager.' using errcode = '22023';
  end if;
  if p_deadline is null then
    raise exception 'Set the final deadline.' using errcode = '22023';
  elsif p_deadline is distinct from p_previous_deadline and p_deadline <= now() then
    raise exception 'The deadline must be in the future.' using errcode = '22023';
  end if;
end;
$$;

-- create_package keeps calling the original signature; it now shares the rules above.
create or replace function private.validate_package(
  p_title text,
  p_product_id uuid,
  p_brief_link text,
  p_reference_links text[],
  p_editor_id uuid,
  p_responsible_manager_id uuid,
  p_deadline timestamptz,
  p_previous_deadline timestamptz
)
returns void
language sql
stable
security definer
set search_path = ''
as $$
  select private.validate_package(
    p_title, p_product_id, p_brief_link, p_reference_links, p_editor_id, p_responsible_manager_id, p_deadline,
    p_previous_deadline, null, null
  )
$$;

-- ── Editing: finished packages keep their editor and deadline ───────────────

-- Same as in 20261021140000_products_without_clients.sql, except:
--  * which statuses can be edited: Archived can't (unarchive first); Completed and Cancelled
--    can, apart from the editor and deadline (reopen a completed package to change those);
--  * a deadline sent back unchanged counts as unchanged. The app sends instants to the
--    millisecond, and the database keeps microseconds, so compare at millisecond precision.
create or replace function public.update_package(
  p_package_id uuid,
  p_title text,
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
  new_deadline timestamptz;
begin
  previous := private.lock_package(p_package_id);
  new_deadline := case when date_trunc('milliseconds', p_deadline) = date_trunc('milliseconds', previous.deadline)
                       then previous.deadline else p_deadline end;
  if previous.status = 'archived' then
    raise exception 'Unarchive this package before editing it.' using errcode = '22023';
  end if;
  if previous.status in ('completed', 'cancelled')
     and (p_editor_id is distinct from previous.editor_id or new_deadline is distinct from previous.deadline) then
    raise exception 'The editor and deadline can’t change on a completed or cancelled package.' using errcode = '22023';
  end if;
  perform private.validate_package(
    p_title, p_product_id, p_brief_link, p_reference_links, p_editor_id, p_responsible_manager_id, new_deadline,
    previous.deadline, previous.editor_id, previous.responsible_manager_id
  );

  update public.packages
  set title = trim(p_title),
      client_id = case when p_product_id = previous.product_id then previous.client_id
                       else (select client_id from public.products where id = p_product_id) end,
      product_id = p_product_id,
      description = coalesce(trim(p_description), ''),
      brief_link = coalesce(trim(p_brief_link), ''),
      reference_links = private.clean_links(p_reference_links),
      deliverables = coalesce(trim(p_deliverables), ''),
      editor_id = p_editor_id,
      responsible_manager_id = p_responsible_manager_id,
      deadline = new_deadline,
      updated_at = now()
  where id = p_package_id
  returning * into pkg;

  if pkg.title <> previous.title then changed := array_append(changed, 'title'); end if;
  if pkg.product_id <> previous.product_id then changed := array_append(changed, 'product'); end if;
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

-- ── Hold and resume ─────────────────────────────────────────────────────────

create function public.hold_package(p_package_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_role('manager', 'put packages on hold');
  pkg public.packages := private.lock_package(p_package_id);
  reason text := private.clean_note(p_reason);
begin
  if pkg.status = 'on_hold' then
    raise exception 'This package is already on hold.' using errcode = '22023';
  elsif pkg.status not in ('assigned', 'in_progress', 'submitted', 'apply_feedback') then
    raise exception 'Only current work can be put on hold.' using errcode = '22023';
  end if;
  update public.packages set status = 'on_hold', previous_status = pkg.status, updated_at = now() where id = pkg.id;
  perform private.log_activity(pkg.id, 'held', actor, 'Put on hold' || coalesce(': ' || reason, ''));
  perform private.notify(pkg.editor_id, 'on_hold', pkg.id, actor, pkg.title || ' was put on hold' || coalesce(': ' || reason, ''));
end;
$$;

create function public.resume_package(p_package_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_role('manager', 'resume packages');
  pkg public.packages := private.lock_package(p_package_id);
  back public.package_status;
begin
  if pkg.status <> 'on_hold' then
    raise exception 'This package isn’t on hold.' using errcode = '22023';
  end if;
  back := coalesce(pkg.previous_status, 'assigned');
  update public.packages set status = back, previous_status = null, updated_at = now() where id = pkg.id;
  perform private.log_activity(pkg.id, 'resumed', actor, 'Resumed (back to ' || private.status_label(back) || ')');
  perform private.notify(pkg.editor_id, 'resumed', pkg.id, actor, pkg.title || ' was resumed');
end;
$$;

-- Same as in 20261021100200_workflow_functions.sql, with a clear message for a package
-- that is on hold (or cancelled) instead of "work has already started".
create or replace function public.start_work(p_package_id uuid)
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
  if pkg.status = 'on_hold' then
    raise exception 'This package is on hold. You’ll be notified when it resumes.' using errcode = '22023';
  elsif pkg.status in ('cancelled', 'archived') then
    raise exception 'This package was cancelled.' using errcode = '22023';
  elsif pkg.status <> 'assigned' then
    raise exception 'Work has already started on this package.' using errcode = '22023';
  end if;
  update public.packages set status = 'in_progress', updated_at = now() where id = pkg.id;
  perform private.log_activity(pkg.id, 'started', actor, 'Started work');
end;
$$;

-- ── Cancel, archive, unarchive ──────────────────────────────────────────────

create function public.cancel_package(p_package_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_role('manager', 'cancel packages');
  pkg public.packages := private.lock_package(p_package_id);
  reason text := private.clean_note(p_reason);
begin
  if pkg.status = 'cancelled' then
    raise exception 'This package is already cancelled.' using errcode = '22023';
  elsif pkg.status in ('completed', 'archived') then
    raise exception 'Completed and archived packages can’t be cancelled.' using errcode = '22023';
  end if;
  update public.packages set status = 'cancelled', previous_status = null, updated_at = now() where id = pkg.id;
  perform private.log_activity(pkg.id, 'cancelled', actor, 'Cancelled' || coalesce(': ' || reason, ''));
  perform private.notify(pkg.editor_id, 'cancelled', pkg.id, actor, pkg.title || ' was cancelled' || coalesce(': ' || reason, ''));
end;
$$;

-- Archived packages leave current work but stay in History and the finished lists.
create function public.archive_package(p_package_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_role('manager', 'archive packages');
  pkg public.packages := private.lock_package(p_package_id);
begin
  if pkg.status = 'archived' then
    raise exception 'This package is already archived.' using errcode = '22023';
  elsif pkg.status not in ('completed', 'cancelled') then
    raise exception 'Only completed or cancelled packages can be archived.' using errcode = '22023';
  end if;
  update public.packages set status = 'archived', previous_status = pkg.status, updated_at = now() where id = pkg.id;
  perform private.log_activity(pkg.id, 'archived', actor, 'Archived');
end;
$$;

create function public.unarchive_package(p_package_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_role('manager', 'unarchive packages');
  pkg public.packages := private.lock_package(p_package_id);
  back public.package_status;
begin
  if pkg.status <> 'archived' then
    raise exception 'This package isn’t archived.' using errcode = '22023';
  end if;
  back := coalesce(pkg.previous_status, case when pkg.completed_at is null then 'cancelled' else 'completed' end::public.package_status);
  update public.packages set status = back, previous_status = null, updated_at = now() where id = pkg.id;
  perform private.log_activity(pkg.id, 'unarchived', actor, 'Unarchived (back to ' || private.status_label(back) || ')');
end;
$$;

-- ── Reopen ──────────────────────────────────────────────────────────────────

-- PRD §5: Completed → Apply Feedback, so the editor resubmits as a new round. The
-- approved round stays as it was.
create function public.reopen_package(p_package_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_role('manager', 'reopen packages');
  pkg public.packages := private.lock_package(p_package_id);
  note text := private.clean_note(p_note);
begin
  if pkg.status <> 'completed' then
    raise exception 'Only completed packages can be reopened.' using errcode = '22023';
  end if;
  update public.packages set status = 'apply_feedback', completed_at = null, updated_at = now() where id = pkg.id;
  perform private.log_activity(pkg.id, 'reopened', actor, 'Reopened for changes' || coalesce(': ' || note, ''));
  perform private.notify(pkg.editor_id, 'reopened', pkg.id, actor, pkg.title || ' was reopened for changes' || coalesce(': ' || note, ''));
end;
$$;

-- ── Delete ──────────────────────────────────────────────────────────────────

-- Only for mistakes: a package nobody has started. Its activity and notices go with it;
-- the editor and responsible manager get a notice that names it, with no link.
create function public.delete_package(p_package_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_role('manager', 'delete packages');
  pkg public.packages := private.lock_package(p_package_id);
  notice text;
begin
  if pkg.status <> 'assigned' or exists (select 1 from public.submissions where package_id = pkg.id) then
    raise exception 'Only packages that haven’t been started can be deleted. Cancel it instead.' using errcode = '22023';
  end if;
  delete from public.packages where id = pkg.id;
  notice := pkg.code || ' ' || pkg.title || ' was deleted by ' || private.person_name(actor);
  perform private.notify(pkg.editor_id, 'deleted', null, actor, notice);
  perform private.notify(pkg.responsible_manager_id, 'deleted', null, actor, notice);
end;
$$;

-- ── Products ────────────────────────────────────────────────────────────────

-- Same rules as create_product, and the same lock, so a rename and an add can't
-- produce two products with one name.
create function public.rename_product(p_product_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_role('manager', 'rename products');
  clean text := trim(coalesce(p_name, ''));
begin
  if clean = '' then
    raise exception 'Enter the product name.' using errcode = '22023';
  elsif char_length(clean) > 80 then
    raise exception 'Keep the product name under 80 characters.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('cne.create_product'));
  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'This product no longer exists.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.products where lower(trim(name)) = lower(clean) and id <> p_product_id) then
    raise exception 'A product called “%” already exists.', clean using errcode = '23505';
  end if;
  update public.products set name = clean where id = p_product_id;
end;
$$;

-- ── Who may call what ───────────────────────────────────────────────────────

revoke all on function private.status_label(public.package_status) from public;
revoke all on function private.clean_note(text) from public;
revoke all on function private.validate_package(text, uuid, text, text[], uuid, uuid, timestamptz, timestamptz, uuid, uuid) from public;
revoke all on function public.hold_package(uuid, text) from public, anon;
revoke all on function public.resume_package(uuid) from public, anon;
revoke all on function public.cancel_package(uuid, text) from public, anon;
revoke all on function public.archive_package(uuid) from public, anon;
revoke all on function public.unarchive_package(uuid) from public, anon;
revoke all on function public.reopen_package(uuid, text) from public, anon;
revoke all on function public.delete_package(uuid) from public, anon;
revoke all on function public.rename_product(uuid, text) from public, anon;

grant execute on function public.hold_package(uuid, text) to authenticated;
grant execute on function public.resume_package(uuid) to authenticated;
grant execute on function public.cancel_package(uuid, text) to authenticated;
grant execute on function public.archive_package(uuid) to authenticated;
grant execute on function public.unarchive_package(uuid) to authenticated;
grant execute on function public.reopen_package(uuid, text) to authenticated;
grant execute on function public.delete_package(uuid) to authenticated;
grant execute on function public.rename_product(uuid, text) to authenticated;
