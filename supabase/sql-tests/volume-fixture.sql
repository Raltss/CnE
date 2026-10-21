-- About one year of realistic data for performance testing, on a SCRATCH
-- database only (plain PostgreSQL + supabase-stub.sql + every migration).
-- Never run it against cne-dev or production: it refuses to run if any
-- package or sign-in account already exists.
--
-- Team size from the PRD: 1 admin, 2 managers, 18 editors.
-- Roughly: 40 products, 3,000 packages (90 active), 4,000 submission rounds,
-- 14,000 activity entries, 11,000 notifications, 4,000 attendance sessions.
-- Sign-in emails: admin@perf.test, manager1@perf.test, manager2@perf.test,
-- editor01@perf.test … editor18@perf.test.
-- Smaller set: psql -v packages=600 -f volume-fixture.sql (the last 90 are active).

\set ON_ERROR_STOP on
\if :{?packages}
\else
  \set packages 3000
\endif
select set_config('fixture.packages', :'packages', false);

do $$
begin
  if exists (select 1 from public.packages) or exists (select 1 from auth.users) then
    raise exception 'volume-fixture.sql only runs on an empty scratch database (packages or sign-in accounts already exist).';
  end if;
end;
$$;

insert into auth.users (email, raw_user_meta_data) values
  ('admin@perf.test', '{"full_name": "Ada Perf"}'),
  ('manager1@perf.test', '{"full_name": "Mara Manalo"}'),
  ('manager2@perf.test', '{"full_name": "Paolo Perez"}');
insert into auth.users (email, raw_user_meta_data)
select format('editor%s@perf.test', lpad(g::text, 2, '0')), jsonb_build_object('full_name', format('Editor %s', lpad(g::text, 2, '0')))
from generate_series(1, 18) g;

select private.approve_staff('admin@perf.test', 'admin', null, 'Operations Admin');
select private.approve_staff('manager1@perf.test', 'manager', null, 'Operations Manager');
select private.approve_staff('manager2@perf.test', 'manager', null, 'Creative Manager');
select private.approve_staff(format('editor%s@perf.test', lpad(g::text, 2, '0')), 'editor', null, 'Video Editor')
from generate_series(1, 18) g;

insert into public.products (name)
select format('%s %s', (array['Kapeng Barako', 'Luzon Fit', 'Bayside Homes', 'Kalye Eats', 'Island Air', 'Sari Market', 'Tala Bank', 'Mabuhay Motors'])[1 + (g % 8)],
  (array['Social Shorts', 'Seasonal Campaign', 'Brand Film', 'Product Demos', 'Event Recaps'])[1 + (g / 8)])
from generate_series(0, 39) g;

do $$
declare
  editors uuid[] := array(select id from public.profiles where role = 'editor' order by email);
  managers uuid[] := array(select id from public.profiles where role = 'manager' order by email);
  products uuid[] := array(select id from public.products order by name);
  total constant integer := current_setting('fixture.packages')::integer;
  active_count constant integer := 90;
  i integer;
  r integer;
  rounds integer;
  editor uuid;
  manager uuid;
  pkg uuid;
  created timestamptz;
  submitted timestamptz;
  status public.package_status;
  outcome public.submission_outcome;
begin
  for i in 1..total loop
    editor := editors[1 + (i % array_length(editors, 1))];
    manager := managers[1 + (i % array_length(managers, 1))];
    if i > total - active_count then
      -- Recent active work, spread over the last ~11 days; some of it is overdue.
      created := now() - (total - i) * interval '3 hours' - interval '1 hour';
      status := (array['assigned', 'in_progress', 'submitted', 'apply_feedback'])[1 + (i % 4)]::public.package_status;
    else
      created := now() - interval '370 days' + i * interval '355 days' / total;
      status := 'completed';
    end if;
    rounds := case status
      when 'completed' then 1 + (i % 3 = 0)::integer
      when 'submitted' then 1 + (i % 2)
      when 'apply_feedback' then 1
      else 0
    end;

    insert into public.packages (
      title, product_id, description, brief_link, reference_links, deliverables, editor_id, responsible_manager_id,
      deadline, status, created_at, created_by, updated_at, completed_at
    )
    values (
      format('Package %s', i), products[1 + (i % array_length(products, 1))], 'Volume fixture package.',
      format('https://docs.google.com/document/d/perf-%s', i), array[format('https://vimeo.com/perf/%s', i)],
      '16:9 master, 9:16 cutdown', editor, manager, created + interval '9 days', status, created, manager,
      created + (rounds + 1) * interval '1 day', case when status = 'completed' then created + (rounds + 1) * interval '1 day' end
    )
    returning id into pkg;

    insert into public.activity (package_id, type, actor_id, at, message)
    values (pkg, 'created', manager, created, 'Created and assigned to the editor');
    insert into public.notifications (recipient_id, type, package_id, actor_id, message, created_at, read_at)
    values (editor, 'assigned', pkg, manager, format('New package assigned: Package %s', i), created,
      case when created < now() - interval '2 days' then created + interval '1 hour' end);
    if status <> 'assigned' then
      insert into public.activity (package_id, type, actor_id, at, message) values (pkg, 'started', editor, created + interval '2 hours', 'Started work');
    end if;

    for r in 1..rounds loop
      submitted := created + r * interval '1 day';
      outcome := case
        when r < rounds then 'feedback'
        when status = 'completed' then 'approved'
        when status = 'apply_feedback' then 'feedback'
        else 'pending'
      end;
      insert into public.submissions (package_id, round, review_link, delivery_link, submitted_at, submitted_by, outcome, decided_at, decided_by, feedback_note)
      values (
        pkg, r, format('https://f.io/perf-%s-r%s', i, r),
        case when outcome = 'approved' then format('https://drive.google.com/perf-%s', i) end,
        submitted, editor, outcome,
        case when outcome <> 'pending' then submitted + interval '4 hours' end,
        case when outcome <> 'pending' then manager end,
        case when outcome = 'feedback' then 'Tighten the intro; see Frame.io comments.' end
      );
      insert into public.activity (package_id, type, actor_id, at, message)
      values (pkg, 'submitted', editor, submitted, format('Submitted Round %s for review', r));
      insert into public.notifications (recipient_id, type, package_id, actor_id, message, created_at, read_at)
      values (manager, 'submitted', pkg, editor, format('Package %s submitted (Round %s)', i, r), submitted,
        case when submitted < now() - interval '2 days' then submitted + interval '1 hour' end);
      if outcome <> 'pending' then
        insert into public.activity (package_id, type, actor_id, at, message)
        values (pkg, case when outcome = 'approved' then 'approved' else 'feedback' end::public.activity_type, manager,
          submitted + interval '4 hours', case when outcome = 'approved' then format('Approved Round %s', r) else format('Marked Apply Feedback on Round %s', r) end);
        insert into public.notifications (recipient_id, type, package_id, actor_id, message, created_at, read_at)
        values (editor, case when outcome = 'approved' then 'approved' else 'feedback' end::public.notification_type, pkg, manager,
          format('Package %s: %s', i, outcome), submitted + interval '4 hours',
          case when submitted < now() - interval '2 days' then submitted + interval '5 hours' end);
      end if;
    end loop;
  end loop;
end;
$$;

-- Weekday attendance for ~240 days, plus a few people clocked in right now.
insert into public.attendance_sessions (person_id, clock_in, clock_out)
select p.id,
  d + interval '8 hours 30 minutes' + (hashtext(p.id::text || d::text) % 40) * interval '1 minute',
  d + interval '17 hours 30 minutes' + (hashtext(d::text || p.id::text) % 40) * interval '1 minute'
from public.profiles p
cross join generate_series(date_trunc('day', now() - interval '240 days'), date_trunc('day', now() - interval '1 day'), interval '1 day') d
where p.role in ('manager', 'editor') and extract(isodow from d) < 6;

insert into public.attendance_sessions (person_id, clock_in)
select id, now() - interval '3 hours' from public.profiles where role in ('manager', 'editor') and email < 'editor06';

analyze;

select
  (select count(*) from public.packages) as packages,
  (select count(*) from public.packages where status <> 'completed') as active,
  (select count(*) from public.submissions) as rounds,
  (select count(*) from public.activity) as activity,
  (select count(*) from public.notifications) as notifications,
  (select count(*) from public.attendance_sessions) as attendance;
