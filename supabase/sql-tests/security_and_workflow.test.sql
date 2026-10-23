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
select test.expect_error('select public.complete_password_change()', 'permission denied', 'anon cannot call complete_password_change');
reset role;

-- ── Signed in but not approved yet ──────────────────────────────────────────

set local role authenticated;
select test.as_user('00000000-0000-0000-0000-000000000099');
select test.expect((select count(*) from public.profiles) = 1, 'pending user sees only their own profile');
select test.expect((select count(*) from public.clients) = 0, 'pending user sees no clients');
select test.expect_error($$select public.create_package('X', 'd0000000-0000-0000-0000-000000000001', '', '', '{}', '', '00000000-0000-0000-0000-000000000011',
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
select test.expect_error($$select public.create_package('X', 'd0000000-0000-0000-0000-000000000001', '', '', '{}', '', '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000001', now() + interval '1 day')$$, 'Only managers', 'admin cannot create packages');
select test.expect_error('select public.clock_in()', 'Only managers and editors', 'admin does not clock in');

-- ── Accounts an admin adds in the app (create-staff-account Edge Function) ───
-- The function creates the Auth user with the service role; only it can set app_metadata.

reset role;
select test.as_trusted();
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-0000-0000-000000000021', 'nina@cne.test', '{"full_name": "Nina Cruz", "title": "Junior Editor"}',
   '{"created_by": "00000000-0000-0000-0000-00000000000a", "must_change_password": true}'),
  ('00000000-0000-0000-0000-000000000022', 'forged@cne.test', '{"created_by": "00000000-0000-0000-0000-00000000000a"}',
   '{"created_by": "00000000-0000-0000-0000-000000000011"}'),
  ('00000000-0000-0000-0000-000000000023', 'garbage@cne.test', '{}', '{"created_by": "not-a-uuid", "must_change_password": "yes"}'),
  ('00000000-0000-0000-0000-000000000024', 'tara@cne.test', '{}',
   '{"created_by": "00000000-0000-0000-0000-00000000000a", "must_change_password": true}');
select test.expect(
  (select full_name = 'Nina Cruz' and title = 'Junior Editor' and must_change_password and role is null and not is_active
   from public.profiles where id = '00000000-0000-0000-0000-000000000021'),
  'an admin-added account gets its name, title, and the temporary-password flag, but no role yet'
);
select test.expect(
  (select actor_id = '00000000-0000-0000-0000-00000000000a' from public.staff_activity
   where profile_id = '00000000-0000-0000-0000-000000000021' and type = 'account_created'),
  'the new account is recorded as created by the admin named in app metadata'
);
select test.expect(
  (select actor_id is null from public.staff_activity where profile_id = '00000000-0000-0000-0000-000000000022' and type = 'account_created'),
  'created_by naming a non-admin, or placed in user metadata, is ignored'
);
select test.expect(
  (select actor_id is null from public.staff_activity where profile_id = '00000000-0000-0000-0000-000000000023' and type = 'account_created')
  and (select not must_change_password from public.profiles where id = '00000000-0000-0000-0000-000000000023'),
  'malformed app metadata doesn''t break account creation'
);

-- Real Supabase Auth (admin createUser) inserts the row first and writes app_metadata in a second UPDATE.
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-0000-0000-000000000025', 'omar@cne.test', '{"full_name": "Omar Diaz"}', '{"provider": "email"}'),
  ('00000000-0000-0000-0000-000000000026', 'forged2@cne.test', '{}', '{"provider": "email"}');
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"created_by": "00000000-0000-0000-0000-00000000000a", "must_change_password": true}'
where id = '00000000-0000-0000-0000-000000000025';
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"created_by": "00000000-0000-0000-0000-000000000011"}'
where id = '00000000-0000-0000-0000-000000000026';
select test.expect(
  (select must_change_password from public.profiles where id = '00000000-0000-0000-0000-000000000025')
  and (select actor_id = '00000000-0000-0000-0000-00000000000a' from public.staff_activity
       where profile_id = '00000000-0000-0000-0000-000000000025' and type = 'account_created'),
  'app metadata written after the account row still sets the password prompt and the creating admin'
);
select test.expect(
  (select actor_id is null from public.staff_activity where profile_id = '00000000-0000-0000-0000-000000000026' and type = 'account_created')
  and (select not must_change_password from public.profiles where id = '00000000-0000-0000-0000-000000000026'),
  'a later created_by naming a non-admin is still ignored'
);
update public.profiles set must_change_password = false where id = '00000000-0000-0000-0000-000000000025';
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"provider": "email"}' where id = '00000000-0000-0000-0000-000000000025';
select test.expect(
  (select not must_change_password from public.profiles where id = '00000000-0000-0000-0000-000000000025'),
  'rewriting the same app metadata later (e.g. on sign-in) doesn''t bring the password prompt back'
);
set local role authenticated;

select test.as_user('00000000-0000-0000-0000-00000000000a');
select public.approve_account('00000000-0000-0000-0000-000000000021', 'editor');
select test.as_user('00000000-0000-0000-0000-000000000021');
select test.expect(
  (select must_change_password and role = 'editor' from public.profiles where id = '00000000-0000-0000-0000-000000000021'),
  'the new editor can see that they must choose a password'
);
select test.expect_error($$update public.profiles set must_change_password = false where id = '00000000-0000-0000-0000-000000000021'$$,
  'permission denied', 'the flag can''t be cleared with a direct update');
select public.complete_password_change();
select test.expect(
  (select not must_change_password from public.profiles where id = '00000000-0000-0000-0000-000000000021')
  and (select must_change_password from public.profiles where id = '00000000-0000-0000-0000-000000000024'),
  'complete_password_change clears only the caller''s own flag'
);
select public.complete_password_change();
select test.expect((select count(*) from public.staff_activity) = 0, 'the person still can''t read the account history');

select test.as_user('00000000-0000-0000-0000-00000000000a');
select test.expect(
  (select actor_id = '00000000-0000-0000-0000-000000000021' from public.staff_activity
   where profile_id = '00000000-0000-0000-0000-000000000021' and message = 'Replaced the temporary password with their own'),
  'choosing their own password is recorded with the person as actor'
);
select test.expect(
  (select count(*) from public.staff_activity where profile_id = '00000000-0000-0000-0000-000000000021'
   and message = 'Changed their password') = 1,
  'a later change is recorded as a normal password change'
);

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

-- Products: managers add them by name; they don't belong to a client.
select set_config('test.product', public.create_product('  Brand Reels  ')::text, true);
select test.expect(
  (select name = 'Brand Reels' and client_id is null and created_by = '00000000-0000-0000-0000-000000000001'
   from public.products where id = current_setting('test.product')::uuid),
  'a manager adds a product with just a name'
);
select test.expect_error($$select public.create_product('brand reels')$$, 'already exists', 'product names are unique, ignoring case');
select test.expect_error($$select public.create_product('   ')$$, 'Enter the product name', 'an empty product name is refused');
select test.expect_error($$select public.create_product(repeat('x', 81))$$, 'under 80', 'a product name over 80 characters is refused');
select test.expect_error($$insert into public.products (name) values ('Direct')$$, 'permission denied', 'products can''t be inserted directly');
select test.as_user('00000000-0000-0000-0000-000000000011');
select test.expect_error($$select public.create_product('Editor Product')$$, 'Only managers', 'editors cannot add products');
select test.as_user('00000000-0000-0000-0000-00000000000a');
select test.expect_error($$select public.create_product('Admin Product')$$, 'Only managers', 'admins cannot add products');
select test.as_user('00000000-0000-0000-0000-000000000001');
select test.expect_error($$select public.create_package('X', 'd0000000-0000-0000-0000-000000000001', '', 'not-a-link', '{}', '', '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000001', now() + interval '1 day')$$, 'brief link', 'invalid brief link is rejected');
select test.expect_error($$select public.create_package('X', 'd0000000-0000-0000-0000-000000000099', '', '', '{}', '', '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000001', now() + interval '1 day')$$, 'Choose a product', 'an unknown product is rejected');
select test.expect_error($$select public.create_package('X', 'd0000000-0000-0000-0000-000000000001', '', '', '{}', '', '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001', now() + interval '1 day')$$, 'active editor', 'a manager cannot be assigned as editor');
select test.expect_error($$select public.create_package('X', 'd0000000-0000-0000-0000-000000000001', '', '', '{}', '', '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000001', now() - interval '1 hour')$$, 'future', 'past deadlines are rejected');

select set_config('test.pkg', public.create_package(
  '  Holiday Blend 30s Hero Spot ', current_setting('test.product')::uuid,
  'Warm, cozy tone.', 'https://docs.google.com/document/d/brief', array[' https://vimeo.com/ref ', ''], '16:9 master',
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', now() + interval '2 days'
)::text, true);

select test.expect(
  (select code = 'PKG-1001' and title = 'Holiday Blend 30s Hero Spot' and status = 'assigned' and reference_links = array['https://vimeo.com/ref']
     and client_id is null
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
select test.expect_error($$select public.update_package(current_setting('test.pkg')::uuid, 'X', 'd0000000-0000-0000-0000-000000000001', '', '', '{}', '', '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000001', now() + interval '3 days')$$, 'editor and deadline', 'a completed package''s deadline cannot change');
select test.expect_error($$select public.update_package(current_setting('test.pkg')::uuid, 'X', 'd0000000-0000-0000-0000-000000000001', '', '', '{}', '', '00000000-0000-0000-0000-000000000012',
  '00000000-0000-0000-0000-000000000001', (select deadline from public.packages where id = current_setting('test.pkg')::uuid))$$,
  'editor and deadline', 'a completed package cannot be reassigned');
select public.update_package(current_setting('test.pkg')::uuid, 'Holiday Blend 30s Hero Spot (final)', current_setting('test.product')::uuid,
  'Warm, cozy tone.', 'https://docs.google.com/document/d/brief', array['https://vimeo.com/ref'], '16:9 master',
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001',
  (select deadline from public.packages where id = current_setting('test.pkg')::uuid));
select test.expect(
  (select title = 'Holiday Blend 30s Hero Spot (final)' and status = 'completed' from public.packages where id = current_setting('test.pkg')::uuid),
  'a completed package''s details can be corrected and it stays completed'
);
-- The app sends instants to the millisecond; the stored deadline has microseconds.
select public.update_package(current_setting('test.pkg')::uuid, 'Holiday Blend 30s Hero Spot', current_setting('test.product')::uuid,
  'Warm, cozy tone.', 'https://docs.google.com/document/d/brief', array['https://vimeo.com/ref'], '16:9 master',
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001',
  (select date_trunc('milliseconds', deadline) from public.packages where id = current_setting('test.pkg')::uuid));
select test.expect(
  (select count(*) from public.activity where package_id = current_setting('test.pkg')::uuid and type = 'deadline_changed') = 0,
  'a deadline sent back at millisecond precision counts as unchanged'
);

select test.as_user('00000000-0000-0000-0000-000000000011');
select test.expect((select count(*) from public.notifications where type = 'approved') = 1, 'editor is notified of approval');

-- ── Reassignment, deadline and manager changes ──────────────────────────────

select test.as_user('00000000-0000-0000-0000-000000000001');
select set_config('test.pkg2', public.create_package(
  'Spin Class Teaser', 'd0000000-0000-0000-0000-000000000002', '', '', '{}', '',
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', now() + interval '2 days'
)::text, true);
select public.update_package(
  current_setting('test.pkg2')::uuid, 'Spin Class Teaser', 'd0000000-0000-0000-0000-000000000002', 'New notes', '', '{}', '', '00000000-0000-0000-0000-000000000012',
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
  'd0000000-0000-0000-0000-000000000002', '', '', '{}', '',
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000002', now() + interval '4 days')$$,
  'Only managers', 'admin cannot reassign or edit packages');
select test.expect_error(format($$update public.packages set status = 'completed' where id = %L$$, current_setting('test.pkg2')),
  'permission denied', 'admin cannot write packages directly');

-- Role changes that would strand open work are refused.
select test.expect_error($$select public.change_staff_role('00000000-0000-0000-0000-000000000012', 'manager')$$,
  'Reassign Jun Villanueva’s 1 open package', 'an editor with open packages keeps the editor role');
select test.expect_error($$select public.change_staff_role('00000000-0000-0000-0000-000000000002', 'editor')$$,
  'Make another manager responsible', 'a manager responsible for open packages keeps the manager role');
select public.change_staff_role('00000000-0000-0000-0000-000000000001', 'editor');
select test.expect((select role = 'editor' from public.profiles where id = '00000000-0000-0000-0000-000000000001'),
  'a manager without open packages can switch to editor (old client links don''t block it)');
select public.change_staff_role('00000000-0000-0000-0000-000000000001', 'manager');

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

-- ── Package lifecycle: hold, resume, cancel, archive, reopen, delete ────────
-- Manager 1 and editor 11 are active; editor 12 was deactivated above.

select test.as_user('00000000-0000-0000-0000-000000000001');
select set_config('test.pkg3', public.create_package(
  'Lifecycle Reel', 'd0000000-0000-0000-0000-000000000001', '', '', '{}', '',
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', now() + interval '2 days'
)::text, true);

-- Only managers change the lifecycle.
select test.as_user('00000000-0000-0000-0000-000000000011');
select test.expect_error(format('select public.hold_package(%L, null)', current_setting('test.pkg3')), 'Only managers', 'editors cannot put packages on hold');
select test.expect_error(format('select public.cancel_package(%L, null)', current_setting('test.pkg3')), 'Only managers', 'editors cannot cancel packages');
select test.expect_error(format('select public.delete_package(%L)', current_setting('test.pkg3')), 'Only managers', 'editors cannot delete packages');
select test.expect_error(format('select public.update_product(%L, %L, null)', current_setting('test.product'), 'X'), 'Only managers', 'editors cannot edit products');
select test.as_user('00000000-0000-0000-0000-00000000000a');
select test.expect_error(format('select public.hold_package(%L, null)', current_setting('test.pkg3')), 'Only managers', 'admin cannot put packages on hold');
select test.expect_error(format('select public.resume_package(%L)', current_setting('test.pkg3')), 'Only managers', 'admin cannot resume packages');
select test.expect_error(format('select public.cancel_package(%L, null)', current_setting('test.pkg3')), 'Only managers', 'admin cannot cancel packages');
select test.expect_error(format('select public.archive_package(%L)', current_setting('test.pkg')), 'Only managers', 'admin cannot archive packages');
select test.expect_error(format('select public.unarchive_package(%L)', current_setting('test.pkg')), 'Only managers', 'admin cannot unarchive packages');
select test.expect_error(format('select public.reopen_package(%L, null)', current_setting('test.pkg')), 'Only managers', 'admin cannot reopen packages');
select test.expect_error(format('select public.delete_package(%L)', current_setting('test.pkg3')), 'Only managers', 'admin cannot delete packages');
select test.expect_error(format('select public.update_product(%L, %L, null)', current_setting('test.product'), 'X'), 'Only managers', 'admin cannot edit products');
select test.expect_error(format('delete from public.packages where id = %L', current_setting('test.pkg3')), 'permission denied', 'packages cannot be deleted directly');

-- Hold remembers the status, and Resume goes back to it.
select test.as_user('00000000-0000-0000-0000-000000000001');
select public.hold_package(current_setting('test.pkg3')::uuid, null);
select test.as_user('00000000-0000-0000-0000-000000000011');
select test.expect_error(format('select public.start_work(%L)', current_setting('test.pkg3')), 'on hold', 'a package on hold cannot be started');
select test.as_user('00000000-0000-0000-0000-000000000001');
select public.resume_package(current_setting('test.pkg3')::uuid);
select test.expect((select status = 'assigned' from public.packages where id = current_setting('test.pkg3')::uuid), 'resume from Assigned goes back to Assigned');
select test.as_user('00000000-0000-0000-0000-000000000011');
select public.start_work(current_setting('test.pkg3')::uuid);
select test.as_user('00000000-0000-0000-0000-000000000001');
select test.expect_error(format('select public.hold_package(%L, %L)', current_setting('test.pkg3'), repeat('x', 501)), 'under 500', 'a hold reason over 500 characters is refused');
select public.hold_package(current_setting('test.pkg3')::uuid, '  Client paused the campaign ');
select test.expect(
  (select status = 'on_hold' and previous_status = 'in_progress' from public.packages where id = current_setting('test.pkg3')::uuid),
  'hold remembers the previous status'
);
select test.expect(
  exists (select 1 from public.activity where package_id = current_setting('test.pkg3')::uuid and type = 'held' and message = 'Put on hold: Client paused the campaign'),
  'the hold and its reason are in the activity history'
);
select test.expect_error(format('select public.hold_package(%L, null)', current_setting('test.pkg3')), 'already on hold', 'a package on hold cannot be held again');
select test.as_user('00000000-0000-0000-0000-000000000011');
select test.expect((select count(*) from public.notifications where type = 'on_hold' and message like '%Client paused the campaign') = 1,
  'the editor is notified of the hold, with the reason');
select test.expect_error(format('select public.submit_for_review(%L, %L, %L)', current_setting('test.pkg3'), 'https://f.io/x', ''),
  'isn’t waiting', 'a package on hold cannot be submitted');
select test.as_user('00000000-0000-0000-0000-000000000001');
select public.resume_package(current_setting('test.pkg3')::uuid);
select test.expect(
  (select status = 'in_progress' and previous_status is null from public.packages where id = current_setting('test.pkg3')::uuid),
  'resume goes back to the exact previous status'
);
select test.expect_error(format('select public.resume_package(%L)', current_setting('test.pkg3')), 'isn’t on hold', 'only packages on hold can be resumed');

-- Started work can't be deleted, only cancelled; current work can't be archived or reopened.
select test.expect_error(format('select public.delete_package(%L)', current_setting('test.pkg3')), 'haven’t been started', 'a started package cannot be deleted');
select test.expect_error(format('select public.archive_package(%L)', current_setting('test.pkg3')), 'Only completed or cancelled', 'current work cannot be archived');
select test.expect_error(format('select public.reopen_package(%L, null)', current_setting('test.pkg3')), 'Only completed', 'current work cannot be reopened');

-- Cancel, then archive and unarchive back to Cancelled.
select public.cancel_package(current_setting('test.pkg3')::uuid, null);
select test.expect((select status = 'cancelled' from public.packages where id = current_setting('test.pkg3')::uuid), 'a package can be cancelled');
select test.expect_error(format('select public.cancel_package(%L, null)', current_setting('test.pkg3')), 'already cancelled', 'a cancelled package cannot be cancelled again');
select test.expect_error(format('select public.hold_package(%L, null)', current_setting('test.pkg3')), 'Only current work', 'a cancelled package cannot be put on hold');
select public.archive_package(current_setting('test.pkg3')::uuid);
select test.expect(
  (select status = 'archived' and previous_status = 'cancelled' from public.packages where id = current_setting('test.pkg3')::uuid),
  'a cancelled package can be archived'
);
select test.expect_error($$select public.update_package(current_setting('test.pkg3')::uuid, 'Lifecycle Reel 2', 'd0000000-0000-0000-0000-000000000001', '', '', '{}', '',
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', (select deadline from public.packages where id = current_setting('test.pkg3')::uuid))$$,
  'Unarchive', 'an archived package cannot be edited');
select public.unarchive_package(current_setting('test.pkg3')::uuid);
select test.expect(
  (select status = 'cancelled' and previous_status is null from public.packages where id = current_setting('test.pkg3')::uuid),
  'unarchive goes back to Cancelled'
);
select test.as_user('00000000-0000-0000-0000-000000000011');
select test.expect((select count(*) from public.notifications where type = 'cancelled' and package_id = current_setting('test.pkg3')::uuid) = 1,
  'the editor is notified of the cancellation');

-- Reopen a completed package: it goes to Apply Feedback and keeps the approved round.
select test.as_user('00000000-0000-0000-0000-000000000001');
select test.expect_error(format('select public.cancel_package(%L, null)', current_setting('test.pkg')), 'Completed and archived', 'a completed package cannot be cancelled');
select public.reopen_package(current_setting('test.pkg')::uuid, 'Client wants a shorter cut');
select test.expect(
  (select status = 'apply_feedback' and completed_at is null from public.packages where id = current_setting('test.pkg')::uuid)
  and (select outcome = 'approved' from public.submissions where package_id = current_setting('test.pkg')::uuid and round = 2),
  'reopen sends the package back for changes and keeps the approved round'
);
select test.as_user('00000000-0000-0000-0000-000000000011');
select test.expect((select count(*) from public.notifications where type = 'reopened' and message like '%shorter cut') = 1,
  'the editor is notified of the reopen, with the note');
select test.expect(
  public.submit_for_review(current_setting('test.pkg')::uuid, 'https://f.io/r3', 'https://drive.google.com/r3') = 3,
  'after a reopen the editor resubmits as a new round'
);

-- Archive a completed package, and unarchive it back to Completed.
select test.as_user('00000000-0000-0000-0000-000000000001');
select public.approve_package(current_setting('test.pkg')::uuid);
select public.archive_package(current_setting('test.pkg')::uuid);
select test.expect_error(format('select public.archive_package(%L)', current_setting('test.pkg')), 'already archived', 'an archived package cannot be archived again');
select test.expect_error(format('select public.reopen_package(%L, null)', current_setting('test.pkg')), 'Only completed', 'an archived package cannot be reopened');
select public.unarchive_package(current_setting('test.pkg')::uuid);
select test.expect((select status = 'completed' from public.packages where id = current_setting('test.pkg')::uuid), 'unarchive goes back to Completed');

-- A package whose editor was deactivated can still be corrected, but not given to them again.
select public.update_package(current_setting('test.pkg2')::uuid, 'Spin Class Teaser v2', 'd0000000-0000-0000-0000-000000000002', '', '', '{}', '',
  '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000002',
  (select deadline from public.packages where id = current_setting('test.pkg2')::uuid));
select test.expect((select title = 'Spin Class Teaser v2' from public.packages where id = current_setting('test.pkg2')::uuid),
  'a package can be corrected while its editor is deactivated');
select test.expect_error($$select public.update_package(current_setting('test.pkg3')::uuid, 'Lifecycle Reel', 'd0000000-0000-0000-0000-000000000001', '', '', '{}', '',
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', now() + interval '9 days')$$,
  'editor and deadline', 'a cancelled package''s deadline cannot change');
select set_config('test.pkg4', public.create_package(
  'Typo Package', 'd0000000-0000-0000-0000-000000000001', '', '', '{}', '',
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', now() + interval '2 days'
)::text, true);
select test.expect_error($$select public.update_package(current_setting('test.pkg4')::uuid, 'Typo Package', 'd0000000-0000-0000-0000-000000000001', '', '', '{}', '',
  '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', (select deadline from public.packages where id = current_setting('test.pkg4')::uuid))$$,
  'active editor', 'a package cannot be reassigned to a deactivated editor');

-- Delete: only a package nobody has started. The editor and responsible manager get a notice with no link.
select public.update_package(current_setting('test.pkg4')::uuid, 'Typo Package', 'd0000000-0000-0000-0000-000000000001', '', '', '{}', '',
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000002', (select deadline from public.packages where id = current_setting('test.pkg4')::uuid));
select public.delete_package(current_setting('test.pkg4')::uuid);
reset role;
select test.as_trusted();
select test.expect(
  (select count(*) from public.packages where id = current_setting('test.pkg4')::uuid) = 0
  and (select count(*) from public.activity where package_id = current_setting('test.pkg4')::uuid) = 0
  and (select count(*) from public.notifications where package_id = current_setting('test.pkg4')::uuid) = 0,
  'deleting a package removes it with its history and notices'
);
select test.expect(
  (select count(*) from public.notifications where type = 'deleted' and package_id is null and message like '%Typo Package was deleted by %'
     and recipient_id in ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000002')) = 2,
  'the editor and responsible manager are told about the deletion'
);
select test.expect((select count(*) from public.notifications where type = 'deleted' and recipient_id = '00000000-0000-0000-0000-000000000001') = 0,
  'the manager who deleted it is not notified');
set local role authenticated;
select test.as_user('00000000-0000-0000-0000-000000000011');
select test.expect((select count(*) from public.notifications where type = 'deleted') = 1, 'the editor can read the deletion notice');
select test.as_user('00000000-0000-0000-0000-000000000001');
select test.expect_error(format('select public.delete_package(%L)', current_setting('test.pkg4')), 'no longer exists', 'a deleted package cannot be deleted twice');

-- Products can be renamed, with the same rules as adding one.
select set_config('test.product2', public.create_product('Gym Promos')::text, true);
select test.expect_error(format('select public.update_product(%L, %L, null)', current_setting('test.product2'), ' brand reels '), 'already exists',
  'a product cannot take another product''s name, ignoring case');
select public.update_product(current_setting('test.product')::uuid, ' brand reels ', null);
select test.expect((select name = 'brand reels' from public.products where id = current_setting('test.product')::uuid),
  'a product can be renamed, including to a different case of its own name');
select test.expect_error(format('select public.update_product(%L, %L, null)', current_setting('test.product2'), '  '), 'Enter the product name', 'an empty product name is refused on rename');
select test.expect_error(format('select public.update_product(%L, %L, null)', 'd0000000-0000-0000-0000-000000000099', 'Ghost'), 'no longer exists', 'renaming an unknown product fails');

-- ── Client review, revision allowances, first delivery ──────────────────────

select test.as_user('00000000-0000-0000-0000-000000000001');
select test.expect_error($$select public.create_product('Retainer Shorts', 21)$$, 'from 0 to 20', 'included revisions over 20 are refused');
select set_config('test.product3', public.create_product('Retainer Shorts', 1)::text, true);
select test.expect((select included_revisions = 1 from public.products where id = current_setting('test.product3')::uuid),
  'a product can include a number of client revisions');
select public.update_product(current_setting('test.product3')::uuid, 'Retainer Shorts', null);
select test.expect((select included_revisions is null from public.products where id = current_setting('test.product3')::uuid),
  'the allowance can be cleared (no limit)');
select public.update_product(current_setting('test.product3')::uuid, 'Retainer Shorts', 1);
select test.expect_error(format('select public.update_product(%L, %L, -1)', current_setting('test.product3'), 'Retainer Shorts'), 'from 0 to 20',
  'a negative allowance is refused');

select set_config('test.pkg5', public.create_package(
  'Retainer Short #1', current_setting('test.product3')::uuid, '', '', '{}', '',
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', now() + interval '2 days'
)::text, true);
select test.as_user('00000000-0000-0000-0000-000000000011');
select public.start_work(current_setting('test.pkg5')::uuid);
select public.submit_for_review(current_setting('test.pkg5')::uuid, 'https://f.io/retainer-r1', '');

-- Only managers send work to the client and record the client's decision.
select test.expect_error(format('select public.send_to_client(%L)', current_setting('test.pkg5')), 'Only managers', 'editors cannot send work to the client');
select test.expect_error(format('select public.record_client_approval(%L)', current_setting('test.pkg5')), 'Only managers', 'editors cannot record client approval');
select test.expect_error(format('select public.record_client_feedback(%L, null)', current_setting('test.pkg5')), 'Only managers', 'editors cannot record client feedback');
select test.as_user('00000000-0000-0000-0000-00000000000a');
select test.expect_error(format('select public.send_to_client(%L)', current_setting('test.pkg5')), 'Only managers', 'admin cannot send work to the client');
select test.expect_error(format('select public.record_client_approval(%L)', current_setting('test.pkg5')), 'Only managers', 'admin cannot record client approval');
select test.expect_error(format('select public.record_client_feedback(%L, null)', current_setting('test.pkg5')), 'Only managers', 'admin cannot record client feedback');
select test.expect_error(format('select public.add_delivery_link(%L, %L)', current_setting('test.pkg5'), 'https://drive.google.com/x'),
  'Only the assigned editor', 'admin cannot add a delivery link');
select test.as_user('00000000-0000-0000-0000-000000000001');
select test.expect_error(format('select public.add_delivery_link(%L, %L)', current_setting('test.pkg5'), 'https://drive.google.com/x'),
  'Only the assigned editor', 'managers cannot add a delivery link for the editor');
select test.expect_error(format('select public.record_client_approval(%L)', current_setting('test.pkg5')), 'isn’t waiting on the client',
  'client approval needs the package to be with the client');

-- Sending to the client approves the round internally; no delivery link is needed yet.
select public.send_to_client(current_setting('test.pkg5')::uuid);
select test.expect(
  (select status = 'client_review' and first_delivered_at is not null from public.packages where id = current_setting('test.pkg5')::uuid)
  and (select outcome = 'with_client' and sent_to_client_at is not null and decided_by = '00000000-0000-0000-0000-000000000001'
       from public.submissions where package_id = current_setting('test.pkg5')::uuid and round = 1),
  'sending to the client marks the package With Client and records the first delivery'
);
select set_config('test.first_delivery', (select first_delivered_at::text from public.packages where id = current_setting('test.pkg5')::uuid), true);
select test.expect_error(format('select public.send_to_client(%L)', current_setting('test.pkg5')), 'Only submitted', 'a package already with the client cannot be sent again');
select test.expect_error(format('select public.request_feedback(%L, null)', current_setting('test.pkg5')), 'Only submitted',
  'internal feedback is not used while the client reviews');
select test.expect_error(format('select public.record_client_approval(%L)', current_setting('test.pkg5')), 'no delivery link yet',
  'the client''s approval needs a delivery link');

-- The editor adds the missing delivery link; the responsible manager is told.
select test.as_user('00000000-0000-0000-0000-000000000011');
select test.expect((select count(*) from public.notifications where type = 'sent_to_client' and package_id = current_setting('test.pkg5')::uuid) = 1,
  'the editor is told the round went to the client');
select test.expect_error(format('select public.add_delivery_link(%L, %L)', current_setting('test.pkg5'), 'not a link'), 'full link', 'the delivery link must be a full link');
select public.add_delivery_link(current_setting('test.pkg5')::uuid, ' https://drive.google.com/retainer-final-1 ');
select test.expect(
  (select delivery_link = 'https://drive.google.com/retainer-final-1' and review_link = 'https://f.io/retainer-r1'
   from public.submissions where package_id = current_setting('test.pkg5')::uuid and round = 1),
  'the editor adds the delivery link to the round, keeping its review link'
);
select test.expect_error(format('select public.add_delivery_link(%L, %L)', current_setting('test.pkg5'), 'https://drive.google.com/other'),
  'already has a delivery link', 'an existing delivery link is never overwritten');
select test.as_user('00000000-0000-0000-0000-000000000001');
select test.expect((select count(*) from public.notifications where type = 'delivery_added') = 1, 'the responsible manager is told about the delivery link');

-- Client feedback goes back to the editor and counts against the product's allowance.
select public.record_client_feedback(current_setting('test.pkg5')::uuid, ' Make the logo bigger ');
select test.expect(
  (select status = 'apply_feedback' from public.packages where id = current_setting('test.pkg5')::uuid)
  and (select outcome = 'client_feedback' and client_decided_by = '00000000-0000-0000-0000-000000000001' and feedback_note = 'Make the logo bigger'
       from public.submissions where package_id = current_setting('test.pkg5')::uuid and round = 1),
  'client feedback sends the package back as Apply Feedback, with the note on the round'
);
select test.expect(
  exists (select 1 from public.activity where package_id = current_setting('test.pkg5')::uuid and type = 'client_feedback'
          and message = 'Client asked for changes on Round 1 (client revision 1): Make the logo bigger'),
  'the first client revision is within the allowance'
);
select test.as_user('00000000-0000-0000-0000-000000000011');
select public.submit_for_review(current_setting('test.pkg5')::uuid, 'https://f.io/retainer-r2', 'https://drive.google.com/retainer-final-2');
select test.as_user('00000000-0000-0000-0000-000000000001');
select public.send_to_client(current_setting('test.pkg5')::uuid);
select public.record_client_feedback(current_setting('test.pkg5')::uuid, null);
select test.expect(
  exists (select 1 from public.activity where package_id = current_setting('test.pkg5')::uuid and type = 'client_feedback'
          and message = 'Client asked for changes on Round 2 (client revision 2, 1 over the 1 included)'),
  'a client revision over the allowance is called out in the history'
);
select test.expect((select first_delivered_at::text = current_setting('test.first_delivery') from public.packages where id = current_setting('test.pkg5')::uuid),
  'later sends to the client keep the first delivery time');

-- The client approves the next round: Completed.
select test.as_user('00000000-0000-0000-0000-000000000011');
select public.submit_for_review(current_setting('test.pkg5')::uuid, 'https://f.io/retainer-r3', 'https://drive.google.com/retainer-final-3');
select test.as_user('00000000-0000-0000-0000-000000000001');
select public.send_to_client(current_setting('test.pkg5')::uuid);
select public.record_client_approval(current_setting('test.pkg5')::uuid);
select test.expect(
  (select status = 'completed' and completed_at is not null from public.packages where id = current_setting('test.pkg5')::uuid)
  and (select outcome = 'approved' and client_decided_at is not null from public.submissions where package_id = current_setting('test.pkg5')::uuid and round = 3)
  and (select array_agg(outcome::text order by round) from public.submissions where package_id = current_setting('test.pkg5')::uuid)
      = array['client_feedback', 'client_feedback', 'approved'],
  'the client''s approval completes the package and every round keeps its outcome'
);
select test.as_user('00000000-0000-0000-0000-000000000011');
select test.expect(
  (select count(*) from public.notifications where package_id = current_setting('test.pkg5')::uuid and type = 'client_feedback') = 2
  and (select count(*) from public.notifications where package_id = current_setting('test.pkg5')::uuid and type = 'client_approved') = 1,
  'the editor is told about each client decision'
);
select test.expect_error(format('select public.add_delivery_link(%L, %L)', current_setting('test.pkg5'), 'https://drive.google.com/late'),
  'only while', 'a delivery link cannot be added after completion');
select test.expect((select count(*) from public.submissions where package_id = current_setting('test.pkg5')::uuid and client_decided_at is not null) = 3,
  'the editor can read the client decisions on their rounds');

-- Approve and complete (no client review) also records the first delivery.
select test.as_user('00000000-0000-0000-0000-000000000001');
select set_config('test.pkg6', public.create_package(
  'Internal Cut', current_setting('test.product3')::uuid, '', '', '{}', '',
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', now() + interval '2 days'
)::text, true);
select test.as_user('00000000-0000-0000-0000-000000000011');
select public.start_work(current_setting('test.pkg6')::uuid);
select public.submit_for_review(current_setting('test.pkg6')::uuid, '', 'https://drive.google.com/internal-final');
select test.as_user('00000000-0000-0000-0000-000000000001');
select public.approve_package(current_setting('test.pkg6')::uuid);
select test.expect(
  (select status = 'completed' and first_delivered_at = completed_at from public.packages where id = current_setting('test.pkg6')::uuid),
  'approving without client review completes the package and records the first delivery'
);

-- With Client can be put on hold (and resumes back to With Client) or cancelled.
select set_config('test.pkg7', public.create_package(
  'Paused With Client', current_setting('test.product3')::uuid, '', '', '{}', '',
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', now() + interval '2 days'
)::text, true);
select test.as_user('00000000-0000-0000-0000-000000000011');
select public.start_work(current_setting('test.pkg7')::uuid);
select public.submit_for_review(current_setting('test.pkg7')::uuid, 'https://f.io/paused', '');
select test.as_user('00000000-0000-0000-0000-000000000001');
select public.send_to_client(current_setting('test.pkg7')::uuid);
select public.hold_package(current_setting('test.pkg7')::uuid, 'Client on vacation');
select test.expect((select status = 'on_hold' and previous_status = 'client_review' from public.packages where id = current_setting('test.pkg7')::uuid),
  'a package with the client can be put on hold');
select public.resume_package(current_setting('test.pkg7')::uuid);
select test.expect((select status = 'client_review' from public.packages where id = current_setting('test.pkg7')::uuid),
  'resuming goes back to With Client');
select test.expect(
  exists (select 1 from public.activity where package_id = current_setting('test.pkg7')::uuid and message = 'Resumed (back to With Client)'),
  'the history names the status it went back to');
select public.cancel_package(current_setting('test.pkg7')::uuid, null);
select test.expect((select status = 'cancelled' from public.packages where id = current_setting('test.pkg7')::uuid), 'a package with the client can be cancelled');

reset role;
rollback;
\echo 'All security and workflow checks passed.'
