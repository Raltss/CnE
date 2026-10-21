-- Live updates: the app listens for changes on these tables and refreshes.
-- Realtime applies each table's RLS policies, so people only receive rows they can read.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime
      add table public.packages, public.submissions, public.activity, public.attendance_sessions, public.notifications;
  end if;
end;
$$;
