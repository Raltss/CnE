-- Products without clients (2026-10-21): work is now organized Product → Package.
--
-- Clients are no longer used by the app. Nothing is deleted: existing client
-- rows and the client links on products and packages stay as they are, but
-- nothing requires or shows them any more. Managers add products by name in
-- the app (create_product). The package functions lose their client parameter.

-- ── Clients become optional ─────────────────────────────────────────────────

alter table public.products alter column client_id drop not null;
alter table public.packages alter column client_id drop not null;
comment on column public.products.client_id is 'Unused since 2026-10-21: products no longer belong to clients.';
comment on column public.packages.client_id is 'Unused since 2026-10-21: kept from before products stopped belonging to clients.';

-- The package's product must exist; it no longer has to match a client.
do $$
declare
  fk text;
begin
  for fk in
    select conname from pg_constraint
    where conrelid = 'public.packages'::regclass and confrelid = 'public.products'::regclass and contype = 'f'
  loop
    execute format('alter table public.packages drop constraint %I', fk);
  end loop;
end;
$$;
alter table public.packages add constraint packages_product_id_fkey foreign key (product_id) references public.products (id);

alter table public.products add column created_by uuid references public.profiles (id);

-- ── Managers add products ───────────────────────────────────────────────────

create function public.create_product(p_name text)
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
  -- One product per name, ignoring case; the lock stops two managers adding the same name at once.
  perform pg_advisory_xact_lock(hashtext('cne.create_product'));
  if exists (select 1 from public.products where lower(trim(name)) = lower(clean)) then
    raise exception 'A product called “%” already exists.', clean using errcode = '23505';
  end if;
  insert into public.products (name, created_by) values (clean, actor) returning id into new_id;
  return new_id;
end;
$$;

-- ── Packages: same rules as before, without the client ──────────────────────

drop function public.create_package(text, uuid, uuid, text, text, text[], text, uuid, uuid, timestamptz);
drop function public.update_package(uuid, text, uuid, uuid, text, text, text[], text, uuid, uuid, timestamptz);
drop function private.validate_package(text, uuid, uuid, text, text[], uuid, uuid, timestamptz, timestamptz);

-- Mirrors validatePackageInput() in src/data/validation.ts.
create function private.validate_package(
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

create function public.create_package(
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
  actor uuid := private.require_role('manager', 'create packages');
  pkg public.packages;
begin
  perform private.validate_package(
    p_title, p_product_id, p_brief_link, p_reference_links, p_editor_id, p_responsible_manager_id, p_deadline, null
  );
  insert into public.packages (
    title, client_id, product_id, description, brief_link, reference_links, deliverables,
    editor_id, responsible_manager_id, deadline, created_by
  )
  values (
    trim(p_title), (select client_id from public.products where id = p_product_id), p_product_id,
    coalesce(trim(p_description), ''), coalesce(trim(p_brief_link), ''),
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
    p_title, p_product_id, p_brief_link, p_reference_links, p_editor_id, p_responsible_manager_id, p_deadline, previous.deadline
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
      deadline = p_deadline,
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

-- ── Role changes no longer depend on client or product managers ─────────────
-- Same as in 20261021120000_admin_oversight.sql, without the clients/products check.

create or replace function public.change_staff_role(p_profile_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_role('admin', 'change roles');
  person public.profiles;
  open_work integer;
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

  update public.profiles set role = p_role where id = person.id;
end;
$$;

-- ── Who may call what ───────────────────────────────────────────────────────

revoke all on function private.validate_package(text, uuid, text, text[], uuid, uuid, timestamptz, timestamptz) from public;
revoke all on function public.create_product(text) from public, anon;
revoke all on function public.create_package(text, uuid, text, text, text[], text, uuid, uuid, timestamptz) from public, anon;
revoke all on function public.update_package(uuid, text, uuid, text, text, text[], text, uuid, uuid, timestamptz) from public, anon;

grant execute on function public.create_product(text) to authenticated;
grant execute on function public.create_package(text, uuid, text, text, text[], text, uuid, uuid, timestamptz) to authenticated;
grant execute on function public.update_package(uuid, text, uuid, text, text, text[], text, uuid, uuid, timestamptz) to authenticated;
