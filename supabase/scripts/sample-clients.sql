-- Starter clients and products for testing (there's no client/product screen yet).
--
-- Run once in Supabase Dashboard → SQL Editor, AFTER you have approved at
-- least one manager with private.approve_staff(...). Edit the two emails
-- below first. Running it again does nothing if the clients already exist.

do $$
declare
  first_manager_email text := 'manager1@example.com';   -- ← change me
  second_manager_email text := 'manager2@example.com';  -- ← change me (may be the same person)
  first_manager uuid;
  second_manager uuid;
  kapeng uuid;
  luzfit uuid;
begin
  select id into first_manager from public.profiles
  where lower(email) = lower(first_manager_email) and role = 'manager' and is_active;
  select id into second_manager from public.profiles
  where lower(email) = lower(second_manager_email) and role = 'manager' and is_active;
  if first_manager is null or second_manager is null then
    raise exception 'Both emails must belong to approved, active managers. Run private.approve_staff(...) first.';
  end if;

  if exists (select 1 from public.clients where name = 'Kapeng Barako Co.') then
    raise notice 'Sample clients already exist; nothing to do.';
    return;
  end if;

  insert into public.clients (name, manager_id) values ('Kapeng Barako Co.', first_manager) returning id into kapeng;
  insert into public.clients (name, manager_id) values ('Luzon Fit Studio', second_manager) returning id into luzfit;

  insert into public.products (client_id, name, manager_id) values
    (kapeng, 'Seasonal Campaigns', first_manager),
    (kapeng, 'Social Shorts', null),            -- falls back to the client's manager
    (luzfit, 'Class Promos', second_manager),
    (luzfit, 'Coach Spotlights', null);

  raise notice 'Added 2 clients and 4 products.';
end;
$$;
