-- Client review, revision allowances, and what the reports read (2026-10-23).
--
--  Submitted ──(manager: send to client)──▶ With Client ──(manager: client approved)──▶ Completed
--      │                                        │
--      │ (manager: approve and complete)        └──(manager: client wants changes)──▶ Apply Feedback
--      ▼                                                                       (counts as a client revision)
--  Completed
--
-- The manager records the client's decision; clients never sign in. A product can say
-- how many client revisions are included, so extra ones stand out. Reports read the
-- packages' first delivery time and each round's outcome, with the usual RLS.

-- ── Columns ─────────────────────────────────────────────────────────────────

-- When the package first went out: sent to the client, or approved and completed without
-- client review. "On time" compares it with the final deadline. Later reopens don't move it.
alter table public.packages add column first_delivered_at timestamptz;
update public.packages p
set first_delivered_at = (select min(a.at) from public.activity a where a.package_id = p.id and a.type = 'approved')
where p.first_delivered_at is null;
create index packages_first_delivered_idx on public.packages (first_delivered_at) where first_delivered_at is not null;

-- The client's side of a round. decided_at/decided_by stay the internal review.
alter table public.submissions
  add column sent_to_client_at timestamptz,
  add column client_decided_at timestamptz,
  add column client_decided_by uuid references public.profiles (id);

-- Client revisions included with the product (null: no limit set).
alter table public.products
  add column included_revisions smallint check (included_revisions between 0 and 20);

-- ── Helpers ─────────────────────────────────────────────────────────────────

-- Same labels as STATUS_META in src/lib/status.ts.
create or replace function private.status_label(status public.package_status)
returns text
language sql
immutable
set search_path = ''
as $$
  select case status
    when 'assigned' then 'Assigned'
    when 'in_progress' then 'In Progress'
    when 'submitted' then 'Submitted'
    when 'client_review' then 'With Client'
    when 'apply_feedback' then 'Apply Feedback'
    when 'completed' then 'Completed'
    when 'on_hold' then 'On Hold'
    when 'cancelled' then 'Cancelled'
    when 'archived' then 'Archived'
  end
$$;

create function private.latest_round(package_id uuid)
returns public.submissions
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.submissions where submissions.package_id = latest_round.package_id order by round desc limit 1
$$;

-- Mirrors validateIncludedRevisions() in src/data/validation.ts.
create function private.check_included_revisions(included integer)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if included is not null and (included < 0 or included > 20) then
    raise exception 'Enter a number of revisions from 0 to 20, or leave it empty for no limit.' using errcode = '22023';
  end if;
end;
$$;

-- ── Internal review: approve and complete, or send to the client ────────────

-- Same as in 20261021100200_workflow_functions.sql, and records the first delivery.
create or replace function public.approve_package(p_package_id uuid)
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
  latest := private.latest_round(pkg.id);
  if latest.delivery_link is null then
    raise exception 'This round has no delivery link. Mark Apply Feedback so the editor can resubmit with one.' using errcode = '22023';
  end if;
  update public.submissions set outcome = 'approved', decided_at = now(), decided_by = actor where id = latest.id;
  update public.packages
  set status = 'completed', completed_at = now(), first_delivered_at = coalesce(first_delivered_at, now()), updated_at = now()
  where id = pkg.id;
  perform private.log_activity(pkg.id, 'approved', actor, 'Approved Round ' || latest.round || '. Package completed');
  perform private.notify(pkg.editor_id, 'approved', pkg.id, actor, pkg.title || ' was approved');
end;
$$;

-- Approves the latest round internally and records that it went to the client. The
-- client usually reviews the review link, so no delivery link is needed yet.
create function public.send_to_client(p_package_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_role('manager', 'send work to the client');
  pkg public.packages := private.lock_package(p_package_id);
  latest public.submissions;
begin
  if pkg.status <> 'submitted' then
    raise exception 'Only submitted packages can be sent to the client.' using errcode = '22023';
  end if;
  latest := private.latest_round(pkg.id);
  update public.submissions
  set outcome = 'with_client', decided_at = now(), decided_by = actor, sent_to_client_at = now()
  where id = latest.id;
  update public.packages
  set status = 'client_review', first_delivered_at = coalesce(first_delivered_at, now()), updated_at = now()
  where id = pkg.id;
  perform private.log_activity(pkg.id, 'sent_to_client', actor, 'Approved Round ' || latest.round || ' and sent it to the client');
  perform private.notify(pkg.editor_id, 'sent_to_client', pkg.id, actor,
    'Round ' || latest.round || ' of ' || pkg.title || ' was approved and sent to the client');
end;
$$;

-- ── The client's decision, recorded by a manager ────────────────────────────

-- Completing still needs a delivery link (PRD default), which the editor can add while
-- the package is with the client (add_delivery_link).
create function public.record_client_approval(p_package_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_role('manager', 'record the client’s decision');
  pkg public.packages := private.lock_package(p_package_id);
  latest public.submissions;
begin
  if pkg.status <> 'client_review' then
    raise exception 'This package isn’t waiting on the client.' using errcode = '22023';
  end if;
  latest := private.latest_round(pkg.id);
  if latest.delivery_link is null then
    raise exception 'Round % has no delivery link yet. Ask the editor to add it, then record the client’s approval.', latest.round
      using errcode = '22023';
  end if;
  update public.submissions
  set outcome = 'approved', client_decided_at = now(), client_decided_by = actor
  where id = latest.id;
  update public.packages set status = 'completed', completed_at = now(), updated_at = now() where id = pkg.id;
  perform private.log_activity(pkg.id, 'client_approved', actor, 'Client approved Round ' || latest.round || '. Package completed');
  perform private.notify(pkg.editor_id, 'client_approved', pkg.id, actor, 'The client approved ' || pkg.title);
end;
$$;

-- Back to the editor as Apply Feedback; the round counts as a client revision, and the
-- history says when it goes over the product's included revisions.
create function public.record_client_feedback(p_package_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_role('manager', 'record the client’s decision');
  pkg public.packages := private.lock_package(p_package_id);
  note text := private.clean_note(p_note);
  latest public.submissions;
  revisions integer;
  included integer;
begin
  if pkg.status <> 'client_review' then
    raise exception 'This package isn’t waiting on the client.' using errcode = '22023';
  end if;
  latest := private.latest_round(pkg.id);
  update public.submissions
  set outcome = 'client_feedback', client_decided_at = now(), client_decided_by = actor, feedback_note = note
  where id = latest.id;
  update public.packages set status = 'apply_feedback', updated_at = now() where id = pkg.id;

  select count(*) into revisions from public.submissions where package_id = pkg.id and outcome = 'client_feedback';
  select included_revisions into included from public.products where id = pkg.product_id;
  perform private.log_activity(pkg.id, 'client_feedback', actor,
    'Client asked for changes on Round ' || latest.round || ' (client revision ' || revisions
      || case when included is not null and revisions > included
           then ', ' || (revisions - included) || ' over the ' || included || ' included' else '' end
      || ')' || coalesce(': ' || note, ''));
  perform private.notify(pkg.editor_id, 'client_feedback', pkg.id, actor,
    'The client asked for changes on ' || pkg.title || coalesce(': ' || note, ''));
end;
$$;

-- The editor adds the final delivery link to a round that has none yet, while it waits
-- for review or for the client. Only a missing link is filled in; nothing is overwritten.
create function public.add_delivery_link(p_package_id uuid, p_delivery_link text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  pkg public.packages := private.lock_package(p_package_id);
  link text := nullif(trim(coalesce(p_delivery_link, '')), '');
  latest public.submissions;
begin
  if not private.has_role('editor') or pkg.editor_id <> actor then
    raise exception 'Only the assigned editor can add the delivery link.' using errcode = '42501';
  end if;
  if pkg.status not in ('submitted', 'client_review') then
    raise exception 'The delivery link can be added only while the round is waiting for review or for the client.' using errcode = '22023';
  end if;
  latest := private.latest_round(pkg.id);
  if latest.delivery_link is not null then
    raise exception 'Round % already has a delivery link.', latest.round using errcode = '22023';
  end if;
  if link is null or not private.is_http_url(link) then
    raise exception 'Enter a full link starting with https://' using errcode = '22023';
  end if;
  update public.submissions set delivery_link = link where id = latest.id;
  perform private.log_activity(pkg.id, 'delivery_added', actor, 'Added the delivery link to Round ' || latest.round);
  perform private.notify(pkg.responsible_manager_id, 'delivery_added', pkg.id, actor,
    private.person_name(actor) || ' added the delivery link to ' || pkg.title || ' (Round ' || latest.round || ')');
end;
$$;

-- ── Hold also covers work waiting on the client ─────────────────────────────

-- Same as in 20261023100100_package_lifecycle.sql, plus With Client.
create or replace function public.hold_package(p_package_id uuid, p_reason text)
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
  elsif pkg.status not in ('assigned', 'in_progress', 'submitted', 'client_review', 'apply_feedback') then
    raise exception 'Only current work can be put on hold.' using errcode = '22023';
  end if;
  update public.packages set status = 'on_hold', previous_status = pkg.status, updated_at = now() where id = pkg.id;
  perform private.log_activity(pkg.id, 'held', actor, 'Put on hold' || coalesce(': ' || reason, ''));
  perform private.notify(pkg.editor_id, 'on_hold', pkg.id, actor, pkg.title || ' was put on hold' || coalesce(': ' || reason, ''));
end;
$$;

-- ── Products: name and included revisions ───────────────────────────────────

-- Replaces create_product(text) and rename_product(uuid, text) with the same rules
-- (trimmed, up to 80 characters, unique ignoring case, one lock for both).
drop function public.create_product(text);
drop function public.rename_product(uuid, text);

create function public.create_product(p_name text, p_included_revisions integer default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_role('manager', 'add products');
  clean text := trim(coalesce(p_name, ''));
  new_id uuid;
begin
  if clean = '' then
    raise exception 'Enter the product name.' using errcode = '22023';
  elsif char_length(clean) > 80 then
    raise exception 'Keep the product name under 80 characters.' using errcode = '22023';
  end if;
  perform private.check_included_revisions(p_included_revisions);
  perform pg_advisory_xact_lock(hashtext('cne.create_product'));
  if exists (select 1 from public.products where lower(trim(name)) = lower(clean)) then
    raise exception 'A product called “%” already exists.', clean using errcode = '23505';
  end if;
  insert into public.products (name, included_revisions, created_by) values (clean, p_included_revisions, actor) returning id into new_id;
  return new_id;
end;
$$;

create function public.update_product(p_product_id uuid, p_name text, p_included_revisions integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_role('manager', 'edit products');
  clean text := trim(coalesce(p_name, ''));
begin
  if clean = '' then
    raise exception 'Enter the product name.' using errcode = '22023';
  elsif char_length(clean) > 80 then
    raise exception 'Keep the product name under 80 characters.' using errcode = '22023';
  end if;
  perform private.check_included_revisions(p_included_revisions);
  perform pg_advisory_xact_lock(hashtext('cne.create_product'));
  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'This product no longer exists.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.products where lower(trim(name)) = lower(clean) and id <> p_product_id) then
    raise exception 'A product called “%” already exists.', clean using errcode = '23505';
  end if;
  update public.products set name = clean, included_revisions = p_included_revisions where id = p_product_id;
end;
$$;

-- ── Who may call what ───────────────────────────────────────────────────────

revoke all on function private.latest_round(uuid) from public;
revoke all on function private.check_included_revisions(integer) from public;
revoke all on function public.send_to_client(uuid) from public, anon;
revoke all on function public.record_client_approval(uuid) from public, anon;
revoke all on function public.record_client_feedback(uuid, text) from public, anon;
revoke all on function public.add_delivery_link(uuid, text) from public, anon;
revoke all on function public.create_product(text, integer) from public, anon;
revoke all on function public.update_product(uuid, text, integer) from public, anon;

grant execute on function public.send_to_client(uuid) to authenticated;
grant execute on function public.record_client_approval(uuid) to authenticated;
grant execute on function public.record_client_feedback(uuid, text) to authenticated;
grant execute on function public.add_delivery_link(uuid, text) to authenticated;
grant execute on function public.create_product(text, integer) to authenticated;
grant execute on function public.update_product(uuid, text, integer) to authenticated;
