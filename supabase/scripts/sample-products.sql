-- Optional starter products for testing. Managers can also add products in the
-- app (Packages → Add product, or "New product" in the package form).
--
-- Run in Supabase Dashboard → SQL Editor. Products that already exist (same
-- name, ignoring case) are skipped, so running it again does nothing.

insert into public.products (name)
select v.name
from (values
  ('Kapeng Barako Seasonal Campaigns'),
  ('Kapeng Barako Social Shorts'),
  ('Luzon Fit Class Promos'),
  ('Luzon Fit Coach Spotlights')
) as v(name)
where not exists (select 1 from public.products p where lower(trim(p.name)) = lower(v.name));
