-- Security and workflow checks for the CnE schema.
--
-- Signs in as different staff (by setting the JWT "sub" claim, like Supabase
-- does) and checks what each role can read and do. Everything runs inside one
-- transaction that is rolled back, so no test data is left behind.
--
-- Run it as the database owner (postgres) after the migrations. See
-- supabase/sql-tests/README.md. Any failure stops the script with "FAILED: ...".

\set ON_ERROR_STOP on
-- Show only the "ok - ..." notices, not every query result.
\o /dev/null
begin;

create schema test;

create function test.as_user(person uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', person, 'role', 'authenticated')::text, true)
$$;

create function test.as_trusted() returns void language sql as $$
  select set_config('request.jwt.claims', '', true)
$$;

create function test.expect(passed boolean, label text) returns void language plpgsql as $$
begin
  if not coalesce(passed, false) then
    raise exception 'FAILED: %', label;
  end if;
  raise notice 'ok - %', label;
end;
$$;

create function test.expect_error(command text, expected text, label text) returns void language plpgsql as $$
declare
  failed boolean := false;
  message text;
begin
  begin
    execute command;
  exception when others then
    failed := true;
    message := sqlerrm;
  end;
  if not failed then
    raise exception 'FAILED: % (expected an error like "%", but it succeeded)', label, expected;
  end if;
  if message not ilike '%' || expected || '%' then
    raise exception 'FAILED: % (expected an error like "%", got "%")', label, expected, message;
  end if;
  raise notice 'ok - %', label;
end;
$$;

grant usage on schema test to anon, authenticated;
grant execute on all functions in schema test to anon, authenticated;

-- ── Trusted setup: what the admin does in the Dashboard + SQL editor ─────────

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@cne.test', '{"full_name": "Ada Admin"}'),
  ('00000000-0000-0000-0000-00000000000b', 'admin2@cne.test', '{}'),
  ('00000000-0000-0000-0000-000000000001', 'andrea@cne.test', '{}'),
  ('00000000-0000-0000-0000-000000000002', 'paolo@cne.test', '{}'),
  ('00000000-0000-0000-0000-000000000011', 'bea@cne.test', '{}'),
  ('00000000-0000-0000-0000-000000000012', 'jun@cne.test', '{}'),
  ('00000000-0000-0000-0000-000000000099', 'newbie@cne.test', '{}');

select test.expect(
  (select count(*) from public.profiles where not is_active and role is null) = 7,
  'new auth users get an inactive profile with no role'
);
select test.expect(
  (select count(*) from public.staff_activity where type = 'account_created' and actor_id is null) = 7,
  'every new account starts its history as a trusted setup step'
);

select private.approve_staff('admin@cne.test', 'admin');
select private.approve_staff('admin2@cne.test', 'admin');
select private.approve_staff('andrea@cne.test', 'manager', 'Andrea Santos', 'Operations Manager');
select private.approve_staff('PAOLO@cne.test', 'manager', 'Paolo Reyes', 'Creative Manager');
select private.approve_staff('bea@cne.test', 'editor', 'Bea Lim', 'Motion Editor');
select private.approve_staff('jun@cne.test', 'editor', 'Jun Villanueva', 'Video Editor');

select test.expect((select full_name from public.profiles where email = 'admin@cne.test') = 'Ada Admin', 'full name comes from user metadata');
select test.expect_error($$select private.approve_staff('nobody@cne.test', 'editor')$$, 'No account uses', 'approving an unknown email fails');
select test.expect(
  (select count(*) from public.staff_activity where type = 'approved' and actor_id is null) = 6,
  'SQL editor approvals are recorded as trusted setup (no signed-in user)'
);
select test.expect(
  (select message from public.staff_activity where type = 'approved' and profile_id = '00000000-0000-0000-0000-000000000011') = 'Approved as Editor'
  and (select message from public.staff_activity where type = 'details_changed' and profile_id = '00000000-0000-0000-0000-000000000011')
    = 'Changed name from “bea” to “Bea Lim”; title from “none” to “Motion Editor”',
  'the history says what changed'
);

insert into public.clients (id, name, manager_id) values
  ('c0000000-0000-0000-0000-000000000001', 'Kapeng Barako Co.', '00000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000002', 'Luzon Fit Studio', '00000000-0000-0000-0000-000000000002');
insert into public.products (id, client_id, name, manager_id) values
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Seasonal Campaigns', '00000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'Class Promos', null);

-- ── Anonymous visitors get nothing ──────────────────────────────────────────

set local role anon;
select test.expect_error('select count(*) from public.packages', 'permission denied', 'anon cannot read packages');
select test.expect_error('select count(*) from public.profiles', 'permission denied', 'anon cannot read profiles');
select test.expect_error('select public.clock_in()', 'permission denied', 'anon cannot call workflow functions');
reset role;

-- ── Signed in but not approved yet ──────────────────────────────────────────

set local role authenticated;
select test.as_user('00000000-0000-0000-0000-000000000099');
select test.expect((select count(*) from public.profiles) = 1, 'pending user sees only their own profile');
select test.expect((select count(*) from public.clients) = 0, 'pending user sees no clients');
select test.expect_error($$select public.create_package('X', 'c0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001', '', '', '{}', '', '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000001', now() + interval '1 day')$$, 'Only managers', 'pending user cannot create packages');
select test.expect_error('select public.clock_in()', 'Only managers and editors', 'pending user cannot clock in');

-- ── Nobody changes their own role ───────────────────────────────────────────

select test.as_user('00000000-0000-0000-0000-000000000011');
select test.expect_error($$update public.profiles set role = 'manager' where id = '00000000-0000-0000-0000-000000000011'$$,
  'permission denied', 'editor cannot promote themselves (no direct profile updates)');
select test.expect_error($$update public.profiles set is_active = true where id = '00000000-0000-0000-0000-000000000099'$$,
  'permission denied', 'editor cannot activate other accounts');
select test.expect_error($$select public.approve_account('00000000-0000-0000-0000-000000000099', 'editor')$$,
  'Only admins', 'editor cannot approve accounts');
select test.expect_error($$select public.change_staff_role('00000000-0000-0000-0000-000000000011', 'manager')$$,
  'Only admins', 'editor cannot change roles, including their own');
select test.expect_error($$select private.approve_staff('bea@cne.test', 'admin')$$, 'permission denied', 'editor cannot call the admin setup function');
select test.expect((select count(*) from public.staff_activity) = 0, 'editors cannot read the account history');

select test.as_user('00000000-0000-0000-0000-000000000001');
select test.expect_error($$select public.deactivate_account('00000000-0000-0000-0000-000000000011')$$,
  'Only admins', 'managers cannot deactivate accounts');
select test.expect((select count(*) from public.staff_activity) = 0, 'managers cannot read the account history');

-- ── Admin: staff access through audited functions ───────────────────────────

select test.as_user('00000000-0000-0000-0000-00000000000a');
select test.expect((select count(*) from public.profiles) = 7, 'admin sees every profile');
select test.expect((select count(*) from public.staff_activity) > 0, 'admin reads the account history');
select test.expect_error($$update public.profiles set title = 'Video Editor II' where id = '00000000-0000-0000-0000-000000000012'$$,
  'permission denied', 'admin cannot update profiles directly, only through the functions');
select test.expect_error($$select public.change_staff_role('00000000-0000-0000-0000-00000000000a', 'manager')$$,
  'own role', 'admin cannot change their own role');
select test.expect_error($$select public.deactivate_account('00000000-0000-0000-0000-00000000000a')$$,
  'own role', 'admin cannot deactivate themselves');
select test.expect_error($$select public.deactivate_account('00000000-0000-0000-0000-00000000000b')$$,
  'SQL editor', 'admin cannot change another admin from the app');
select test.expect_error($$select public.approve_account('00000000-0000-0000-0000-000000000099', 'admin')$$,
  'SQL editor', 'admin access cannot be granted from the app');
select test.expect_error($$select private.approve_staff('newbie@cne.test', 'admin')$$,
  'permission denied', 'admin cannot call the SQL-editor-only setup function');

select public.approve_account('00000000-0000-0000-0000-000000000099', 'editor');
select test.expect(
  (select role = 'editor' and is_active from public.profiles where id = '00000000-0000-0000-0000-000000000099'),
  'admin approves a waiting account as editor'
);
select test.expect(
  (select actor_id = '00000000-0000-0000-0000-00000000000a' and message = 'Approved as Editor'
   from public.staff_activity where type = 'approved' and profile_id = '00000000-0000-0000-0000-000000000099'),
  'the approval is recorded under the admin who made it'
);
select test.expect_error($$select public.approve_account('00000000-0000-0000-0000-000000000099', 'manager')$$,
  'already has a role', 'an approved account cannot be approved again');
select test.expect_error($$select public.change_staff_role('00000000-0000-0000-0000-000000000099', 'editor')$$,
  'already an editor', 'changing to the same role is refused');
select public.change_staff_role('00000000-0000-0000-0000-000000000099', 'manager');
select public.deactivate_account('00000000-0000-0000-0000-000000000099');
select test.expect_error($$select public.deactivate_account('00000000-0000-0000-0000-000000000099')$$,
  'isn’t active', 'deactivating twice is refused');
select public.reactivate_account('00000000-0000-0000-0000-000000000099');
select public.deactivate_account('00000000-0000-0000-0000-000000000099');
select test.expect(
  (select array_agg(message order by message) from public.staff_activity
   where profile_id = '00000000-0000-0000-0000-000000000099' and actor_id = '00000000-0000-0000-0000-00000000000a')
    = array['Approved as Editor', 'Deactivated', 'Deactivated', 'Reactivated as Manager', 'Role changed from Editor to Manager'],
  'every admin change is recorded under the admin'
);

select test.expect((select count(*) from public.clients) = 2, 'admin can read clients for oversight');
select test.expect_error($$select public.create_package('X', 'c0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001', '', '', '{}', '', '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000001', now() + interval '1 day')$$, 'Only managers', 'admin cannot create packages');
select test.expect_error('select public.clock_in()', 'Only managers and editors', 'admin does not clock in');

-- The trigger is a second lock behind RLS: even a direct table write is refused.
reset role;
select test.as_user('00000000-0000-0000-0000-000000000011');
select test.expect_error($$update public.profiles set role = 'manager' where id = '00000000-0000-0000-0000-000000000011'$$,
  'own role', 'profile trigger refuses self role changes even without RLS');
select test.as_user('00000000-0000-0000-0000-000000000001');
select test.expect_error($$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000011'$$,
  'Only an admin', 'profile trigger refuses role changes by non-admins');
set local role authenticated;

-- ── Manager creates and assigns a package ───────────────────────────────────

select test.as_user('00000000-0000-0000-0000-000000000001');
select test.expect_error($$select public.create_package('X', 'c0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001', '', 'not-a-link', '{}', '', '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000001', now() + interval '1 day')$$, 'brief link', 'invalid brief link is rejected');
select test.expect_error($$select public.create_package('X', 'c0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000002', '', '', '{}', '', '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000001', now() + interval '1 day')$$, 'belongs to this client', 'product from another client is rejected');
select test.expect_error($$select public.create_package('X', 'c0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001', '', '', '{}', '', '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001', now() + interval '1 day')$$, 'active editor', 'a manager cannot be assigned as editor');
select test.expect_error($$select public.create_package('X', 'c0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001', '', '', '{}', '', '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000001', now() - interval '1 hour')$$, 'future', 'past deadlines are rejected');

select set_config('test.pkg', public.create_package(
  '  Holiday Blend 30s Hero Spot ', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
  'Warm, cozy tone.', 'https://docs.google.com/document/d/brief', array[' https://vimeo.com/ref ', ''], '16:9 master',
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', now() + interval '2 days'
)::text, true);

select test.expect(
  (select code = 'PKG-1001' and title = 'Holiday Blend 30s Hero Spot' and status = 'assigned' and reference_links = array['https://vimeo.com/ref']
   from public.packages where id = current_setting('test.pkg')::uuid),
  'package is created as Assigned with a code and cleaned input'
);
select test.expect((select count(*) from public.activity where type = 'created') = 1, 'creation is logged in activity');

-- ── Editor isolation ────────────────────────────────────────────────────────

select test.as_user('00000000-0000-0000-0000-000000000012');
select test.expect((select count(*) from public.packages) = 0, 'another editor cannot see the package');
select test.expect((select count(*) from public.activity) = 0, 'another editor cannot see its activity');
select test.expect_error(format('select public.start_work(%L)', current_setting('test.pkg')), 'Only the assigned editor',
  'another editor cannot start it');

-- ── Assigned editor: start, submit ──────────────────────────────────────────

select test.as_user('00000000-0000-0000-0000-000000000011');
select test.expect((select count(*) from public.packages) = 1, 'assigned editor sees the package');
select test.expect(
  (select count(*) from public.notifications where type = 'assigned') = 1,
  'assigned editor is notified'
);
select test.expect_error(format('select public.submit_for_review(%L, %L, %L)', current_setting('test.pkg'), 'https://f.io/r1', ''),
  'Start work before submitting', 'cannot submit before starting');
select public.start_work(current_setting('test.pkg')::uuid);
select test.expect_error(format('select public.start_work(%L)', current_setting('test.pkg')), 'already started', 'cannot start twice');
select test.expect_error(format('select public.submit_for_review(%L, %L, %L)', current_setting('test.pkg'), ' ', ''),
  'Add a review link', 'a submission needs at least one link');
select test.expect_error(format('select public.submit_for_review(%L, %L, %L)', current_setting('test.pkg'), 'f.io/r1', ''),
  'full link', 'links must be full URLs');
select test.expect(public.submit_for_review(current_setting('test.pkg')::uuid, 'https://f.io/r1', '') = 1, 'first submission is Round 1');
select test.expect_error(format('select public.approve_package(%L)', current_setting('test.pkg')), 'Only managers', 'editor cannot approve');

-- Direct writes are refused no matter what the row says.
select test.expect_error(format($$update public.packages set status = 'completed' where id = %L$$, current_setting('test.pkg')),
  'permission denied', 'editor cannot update packages directly');
select test.expect_error(format($$insert into public.submissions (package_id, round, review_link, submitted_by)
  values (%L, 9, 'https://f.io/x', '00000000-0000-0000-0000-000000000011')$$, current_setting('test.pkg')),
  'permission denied', 'editor cannot insert submissions directly');
select test.expect_error(format($$insert into public.notifications (recipient_id, type, package_id, actor_id, message)
  values ('00000000-0000-0000-0000-000000000001', 'approved', %L, '00000000-0000-0000-0000-000000000011', 'spam')$$,
  current_setting('test.pkg')), 'permission denied', 'editor cannot create notifications');
select test.expect_error('delete from public.activity', 'permission denied', 'editor cannot delete history');

-- ── Manager review: feedback, resubmit, approve ─────────────────────────────

select test.as_user('00000000-0000-0000-0000-000000000001');
select test.expect(
  (select count(*) from public.notifications where type = 'submitted' and message like 'Bea Lim submitted%(Round 1)') = 1,
  'responsible manager is notified of the submission'
);
select test.expect_error(format('select public.approve_package(%L)', current_setting('test.pkg')), 'no delivery link',
  'a round without a delivery link cannot be approved');
select public.request_feedback(current_setting('test.pkg')::uuid, 'Tighten the first 3 seconds.');

select test.as_user('00000000-0000-0000-0000-000000000011');
select test.expect((select status from public.packages where id = current_setting('test.pkg')::uuid) = 'apply_feedback', 'status is Apply Feedback');
select test.expect(
  public.submit_for_review(current_setting('test.pkg')::uuid, 'https://f.io/r1', 'https://drive.google.com/final') = 2,
  'resubmission is Round 2, even with a repeated review link'
);
select test.expect(
  (select outcome = 'feedback' and feedback_note = 'Tighten the first 3 seconds.' from public.submissions where round = 1),
  'Round 1 keeps its outcome and note'
);

-- Any manager may approve; only the responsible manager was notified.
select test.as_user('00000000-0000-0000-0000-000000000002');
select public.approve_package(current_setting('test.pkg')::uuid);
select test.expect(
  (select status = 'completed' and completed_at is not null from public.packages where id = current_setting('test.pkg')::uuid),
  'approval completes the package'
);
select test.expect((select count(*) from public.notifications) = 0, 'a non-responsible manager got no submission notifications');
select test.as_user('00000000-0000-0000-0000-000000000001');
select test.expect_error($$select public.update_package(current_setting('test.pkg')::uuid, 'X', 'c0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001', '', '', '{}', '', '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000001', now() + interval '3 days')$$, 'Completed packages', 'completed packages cannot be edited');

select test.as_user('00000000-0000-0000-0000-000000000011');
select test.expect((select count(*) from public.notifications where type = 'approved') = 1, 'editor is notified of approval');

-- ── Reassignment, deadline and manager changes ──────────────────────────────

select test.as_user('00000000-0000-0000-0000-000000000001');
select set_config('test.pkg2', public.create_package(
  'Spin Class Teaser', 'c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', '', '', '{}', '',
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', now() + interval '2 days'
)::text, true);
select public.update_package(
  current_setting('test.pkg2')::uuid, 'Spin Class Teaser', 'c0000000-0000-0000-0000-000000000002',
  'd0000000-0000-0000-0000-000000000002', 'New notes', '', '{}', '', '00000000-0000-0000-0000-000000000012',
  '00000000-0000-0000-0000-000000000002', now() + interval '4 days'
);
select test.expect(
  (select array_agg(type::text order by type::text) from public.activity where package_id = current_setting('test.pkg2')::uuid)
    = array['created', 'deadline_changed', 'edited', 'manager_changed', 'reassigned'],
  'reassignment, deadline, manager and field edits are all logged'
);

select test.as_user('00000000-0000-0000-0000-000000000011');
select test.expect((select count(*) from public.packages where id = current_setting('test.pkg2')::uuid) = 0, 'previous editor loses access');
select test.expect((select count(*) from public.notifications where type = 'reassigned_away') = 1, 'previous editor is notified');
select test.as_user('00000000-0000-0000-0000-000000000012');
select test.expect((select count(*) from public.packages) = 1, 'new editor sees the package');
select test.expect(
  (select count(*) from public.notifications where type in ('assigned', 'deadline_changed')) = 2,
  'new editor is notified of the assignment and the deadline'
);
select test.as_user('00000000-0000-0000-0000-000000000002');
select test.expect((select count(*) from public.notifications where type = 'manager_changed') = 1, 'new responsible manager is notified');

-- ── Admin oversight is read-only ────────────────────────────────────────────

reset role;
select test.as_trusted();
select set_config('test.activity_total', (select count(*)::text from public.activity), true);
set local role authenticated;

select test.as_user('00000000-0000-0000-0000-00000000000a');
select test.expect((select count(*) from public.packages) = 2, 'admin reads every package');
select test.expect((select count(*) from public.submissions) = 2, 'admin reads every submission round');
select test.expect((select count(*)::text from public.activity) = current_setting('test.activity_total'), 'admin reads all package history');
select test.expect((select count(*) from public.notifications) = 0, 'admin does not read other people''s notifications');
select test.expect_error(format('select public.start_work(%L)', current_setting('test.pkg2')), 'Only the assigned editor',
  'admin cannot start work');
select test.expect_error(format('select public.submit_for_review(%L, %L, %L)', current_setting('test.pkg2'), 'https://f.io/x', ''),
  'Only the assigned editor', 'admin cannot submit');
select test.expect_error(format('select public.request_feedback(%L, %L)', current_setting('test.pkg'), 'x'), 'Only managers',
  'admin cannot request feedback');
select test.expect_error(format('select public.approve_package(%L)', current_setting('test.pkg')), 'Only managers', 'admin cannot approve');
select test.expect_error($$select public.update_package(current_setting('test.pkg2')::uuid, 'Spin Class Teaser',
  'c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', '', '', '{}', '',
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000002', now() + interval '4 days')$$,
  'Only managers', 'admin cannot reassign or edit packages');
select test.expect_error(format($$update public.packages set status = 'completed' where id = %L$$, current_setting('test.pkg2')),
  'permission denied', 'admin cannot write packages directly');

-- Role changes that would strand open work are refused.
select test.expect_error($$select public.change_staff_role('00000000-0000-0000-0000-000000000012', 'manager')$$,
  'Reassign Jun Villanueva’s 1 open package', 'an editor with open packages keeps the editor role');
select test.expect_error($$select public.change_staff_role('00000000-0000-0000-0000-000000000002', 'editor')$$,
  'Make another manager responsible', 'a manager responsible for open packages keeps the manager role');
select test.expect_error($$select public.change_staff_role('00000000-0000-0000-0000-000000000001', 'editor')$$,
  'assigned manager for 2 clients and products', 'a manager assigned to clients keeps the manager role');

-- ── Notifications stay private ──────────────────────────────────────────────

select test.as_user('00000000-0000-0000-0000-000000000012');
select test.expect(
  (select count(*) from public.notifications where recipient_id <> '00000000-0000-0000-0000-000000000012') = 0,
  'people only read their own notifications'
);
reset role;
select test.as_trusted();
select set_config('test.bea_ntf', (select id::text from public.notifications where recipient_id = '00000000-0000-0000-0000-000000000011' limit 1), true);
set local role authenticated;
select test.as_user('00000000-0000-0000-0000-000000000012');
select test.expect_error(format('select public.mark_notification_read(%L)', current_setting('test.bea_ntf')), 'not found',
  'cannot mark someone else''s notification as read');
select test.as_user('00000000-0000-0000-0000-000000000011');
select test.expect(public.mark_all_notifications_read() = 5, 'mark all as read returns the number marked');
select test.expect((select count(*) from public.notifications where read_at is null) = 0, 'no unread notifications remain');

-- ── Attendance ──────────────────────────────────────────────────────────────

select public.clock_in();
select test.expect_error('select public.clock_in()', 'already clocked in', 'only one open session per person');
select test.expect_error($$insert into public.attendance_sessions (person_id) values ('00000000-0000-0000-0000-000000000011')$$,
  'permission denied', 'sessions cannot be inserted directly');
select test.as_user('00000000-0000-0000-0000-000000000012');
select test.expect((select count(*) from public.attendance_sessions) = 0, 'editors cannot see other people''s attendance');
select test.as_user('00000000-0000-0000-0000-000000000001');
select test.expect((select count(*) from public.attendance_sessions) = 1, 'managers see team attendance');
select test.as_user('00000000-0000-0000-0000-00000000000a');
select test.expect((select count(*) from public.attendance_sessions) = 1, 'admin sees team attendance');
select test.expect_error($$insert into public.attendance_sessions (person_id) values ('00000000-0000-0000-0000-000000000011')$$,
  'permission denied', 'admin cannot write attendance');
select test.as_user('00000000-0000-0000-0000-000000000011');
select public.clock_out();
select test.expect_error('select public.clock_out()', 'clocked in', 'cannot clock out twice');

-- A session left open for 17 hours is closed at clock-in + 16h and flagged.
reset role;
insert into public.attendance_sessions (person_id, clock_in)
values ('00000000-0000-0000-0000-000000000012', now() - interval '17 hours');
set local role authenticated;
select test.as_user('00000000-0000-0000-0000-000000000012');
select public.clock_in();
select test.expect(
  (select count(*) from public.attendance_sessions where auto_closed and clock_out = clock_in + interval '16 hours') = 1
  and (select count(*) from public.attendance_sessions where clock_out is null) = 1,
  'stale session is auto-closed at 16 hours before the new clock-in'
);

-- ── Deactivation removes access, keeps history ──────────────────────────────

select test.as_user('00000000-0000-0000-0000-00000000000a');
select public.deactivate_account('00000000-0000-0000-0000-000000000012');
select test.expect(
  (select not is_active from public.profiles where id = '00000000-0000-0000-0000-000000000012')
  and (select count(*) from public.staff_activity where profile_id = '00000000-0000-0000-0000-000000000012'
       and type = 'deactivated' and actor_id = '00000000-0000-0000-0000-00000000000a') = 1,
  'admin can deactivate an account with open work, and it is recorded'
);
select test.as_user('00000000-0000-0000-0000-000000000012');
select test.expect((select count(*) from public.packages) = 0, 'deactivated editor loses access to packages');
select test.expect((select count(*) from public.notifications) = 0, 'deactivated editor loses access to notifications');
select test.expect_error('select public.clock_out()', 'Only managers and editors', 'deactivated editor cannot clock out');
select test.as_user('00000000-0000-0000-0000-000000000001');
select test.expect(
  (select count(*) from public.packages where editor_id = '00000000-0000-0000-0000-000000000012') = 1,
  'their packages and history remain for managers'
);

reset role;
rollback;
\echo 'All security and workflow checks passed.'
