-- Read performance, measured with supabase/sql-tests/volume-fixture.sql (3,000 packages,
-- 3,925 rounds) through PostgREST, as a signed-in manager.
--
-- 1. No JIT compilation for signed-in API requests.
--    With Row Level Security on, Postgres can't use column statistics for the status
--    filters, so it guesses about 900 of 3,000 packages instead of the 90 that match,
--    prices the current-work read above jit_above_cost, and spends ~15 ms compiling a
--    query that runs in ~3 ms. Every API read here is small, so JIT never pays off.
--    (Measured: current-work read 22-34 ms -> ~4.5 ms.) PostgREST applies the settings
--    of the role it switches to on every request.
alter role authenticated set jit = off;

-- 2. Finished packages are listed newest first, 25 at a time. Without an index in that
--    order, every finished package (and its latest round) is read and sorted to show
--    one page. (Measured: first page 16.6 ms -> 2.5 ms; page 41: 17.5 ms -> 7.3 ms.)
create index packages_finished_order_idx on public.packages (completed_at desc nulls last, updated_at desc, id desc);

-- Tell PostgREST to pick up the role setting now rather than at its next restart.
notify pgrst, 'reload config';
