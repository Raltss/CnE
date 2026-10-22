#!/usr/bin/env node
// End-to-end check of the CnE backend through the public API, the way the app uses it:
// every person is a separate signed-in Supabase session (no service-role key).
//
// It adds a test manager and two test editors through the create-staff-account Edge
// Function (Add user), then runs the v1 workflow and checks permissions, notifications
// (rows and Realtime delivery), attendance, and access for deactivated and unapproved
// accounts. At the end it deactivates the test accounts (their history stays).
// Test records stay in the project. Never run it against production.
//
// Usage (from the project folder):
//   CNE_SUPABASE_URL=https://<ref>.supabase.co CNE_SUPABASE_KEY=sb_publishable_... \
//   CNE_ADMIN_EMAIL=you@agency.com CNE_ADMIN_PASSWORD='...' \
//   node supabase/e2e/verify-backend.mjs
//
// Optional:
//   CNE_PENDING_EMAIL / CNE_PENDING_PASSWORD  an account created in the Dashboard and never approved
//   CNE_TEST_EMAIL_DOMAIN                     domain for the test accounts (default example.com)
//   CNE_KEEP_ACCOUNTS=1                       leave the test accounts active afterwards
// See supabase/e2e/README.md.
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

const env = (name, fallback) => {
  const value = process.env[name] ?? fallback
  if (value === undefined) {
    console.error(`Set ${name}. See supabase/e2e/README.md.`)
    process.exit(2)
  }
  return value
}
const URL = env('CNE_SUPABASE_URL')
const KEY = env('CNE_SUPABASE_KEY')
const ADMIN = { email: env('CNE_ADMIN_EMAIL'), password: env('CNE_ADMIN_PASSWORD') }
const PENDING = process.env.CNE_PENDING_EMAIL ? { email: process.env.CNE_PENDING_EMAIL, password: env('CNE_PENDING_PASSWORD') } : null
const DOMAIN = env('CNE_TEST_EMAIL_DOMAIN', 'example.com')
const RUN = Date.now().toString(36)

// ── Reporting ───────────────────────────────────────────────────────────────

const results = []
const record = (status, label, detail = '') => {
  results.push({ status, label, detail })
  console.log(`${status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : 'SKIP'}  ${label}${detail ? ` — ${detail}` : ''}`)
}
const check = (passed, label, detail) => record(passed ? 'pass' : 'fail', label, passed ? '' : detail)

/** Expect a call to be refused (a Supabase error, or no rows changed). */
async function refused(label, call, pattern) {
  const { error } = await call()
  if (!error) return record('fail', label, 'it was allowed')
  check(!pattern || pattern.test(error.message), label, `unexpected error: ${error.message}`)
}

/** Stop the run when a step that later checks depend on fails. */
function must(result, label) {
  if (result.error || result.data === null || result.data === undefined) {
    record('fail', label, result.error?.message ?? 'no data')
    throw new Error(`Stopped: ${label}`)
  }
  record('pass', label)
  return result.data
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function waitFor(predicate, ms = 10_000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(200)) if (predicate()) return true
  return predicate()
}
const password = () => `${randomBytes(12).toString('base64url')}-Aa1`

// ── Sessions ────────────────────────────────────────────────────────────────

/** A separate signed-in person: their own client, token, and Realtime connection. */
async function signIn(email, pass) {
  const client = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.signInWithPassword({ email, password: pass })
  if (error) return { error }
  return { client, user: data.user }
}

/** Collects Realtime events this person receives. */
function listen(person, name, table, filter) {
  const events = []
  const status = { subscribed: false }
  const channel = person.client
    .channel(`e2e-${name}-${RUN}-${randomBytes(3).toString('hex')}`)
    .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, (change) => events.push(change))
    .subscribe((state) => {
      if (state === 'SUBSCRIBED') status.subscribed = true
    })
  return { events, status, stop: () => person.client.removeChannel(channel) }
}

const notificationsOf = async (person) =>
  (await person.client.from('notifications').select('type, package_id, message, read_at').eq('recipient_id', person.user.id)).data ?? []

// ── The run ─────────────────────────────────────────────────────────────────

const created = []
let admin

async function main() {
  console.log(`CnE backend check against ${URL} (run ${RUN})\n`)

  // 1. Admin signs in and adds the test staff through the Edge Function.
  admin = await signIn(ADMIN.email, ADMIN.password)
  if (admin.error) throw new Error(`Admin sign-in failed: ${admin.error.message}`)
  const adminProfile = must(await admin.client.from('profiles').select('id, role, is_active').eq('id', admin.user.id).single(), 'admin signs in with email + password')
  check(adminProfile.role === 'admin' && adminProfile.is_active, 'admin profile is an active admin', JSON.stringify(adminProfile))

  const people = {}
  for (const [key, role, name] of [
    ['manager', 'manager', 'E2E Manager'],
    ['editor', 'editor', 'E2E Editor One'],
    ['other', 'editor', 'E2E Editor Two'],
  ]) {
    const email = `cne-e2e-${RUN}-${key}@${DOMAIN}`
    const temporary = password()
    const { data, error } = await admin.client.functions.invoke('create-staff-account', {
      body: { fullName: `${name} ${RUN}`, email, title: 'E2E test account', role, password: temporary },
    })
    if (error || !data?.id) {
      const body = error?.context instanceof Response ? await error.context.text() : ''
      record('fail', `Add user creates the ${key}`, `${error?.message ?? 'no id'} ${body}`)
      throw new Error('Stopped: Add user failed')
    }
    record('pass', `Add user creates the ${key} (${role}) with a temporary password`)
    created.push(data.id)
    people[key] = { id: data.id, email, temporary }
  }

  const history = (await admin.client.from('staff_activity').select('profile_id, actor_id, type').in('profile_id', created)).data ?? []
  check(
    created.every((id) => history.some((h) => h.profile_id === id && h.type === 'approved' && h.actor_id === admin.user.id)),
    'account history records each approval under the admin',
    JSON.stringify(history),
  )
  const duplicate = await admin.client.functions.invoke('create-staff-account', {
    body: { fullName: 'Duplicate', email: people.editor.email, title: '', role: 'editor', password: password() },
  })
  check(Boolean(duplicate.error), 'Add user refuses an email that already has an account')

  // 2. First sign-in: each person must replace the temporary password.
  for (const key of Object.keys(people)) {
    const person = people[key]
    const session = await signIn(person.email, person.temporary)
    if (session.error) throw new Error(`${key} can't sign in: ${session.error.message}`)
    const { data: me } = await session.client.from('profiles').select('must_change_password').eq('id', person.id).single()
    check(me?.must_change_password === true, `${key} is asked to choose their own password at first sign-in`)
    person.password = password()
    const changed = await session.client.auth.updateUser({ password: person.password })
    const recorded = changed.error ? changed : await session.client.rpc('complete_password_change')
    check(!changed.error && !recorded.error, `${key} sets their own password`, (changed.error ?? recorded.error)?.message)
    const old = await signIn(person.email, person.temporary)
    check(Boolean(old.error), `${key}'s temporary password stops working`)
    Object.assign(person, await signIn(person.email, person.password))
    if (person.error) throw new Error(`${key} can't sign in with the new password`)
  }
  const { manager, editor, other } = people

  // Live listeners (Realtime) before anything happens.
  const editorInbox = listen(editor, 'editor-notifications', 'notifications', `recipient_id=eq.${editor.id}`)
  const managerInbox = listen(manager, 'manager-notifications', 'notifications', `recipient_id=eq.${manager.id}`)
  const managerActivity = listen(manager, 'manager-activity', 'activity')
  const otherActivity = listen(other, 'other-activity', 'activity')
  const subscribed = await waitFor(() => [editorInbox, managerInbox, managerActivity, otherActivity].every((l) => l.status.subscribed))
  check(subscribed, 'Realtime subscriptions are accepted for each person')

  // 3. Manager adds a product and creates + assigns a package.
  const productName = `E2E Product ${RUN}`
  const productId = must(await manager.client.rpc('create_product', { p_name: productName }), 'manager adds a product by name')
  await refused('product names are unique, ignoring case', () => manager.client.rpc('create_product', { p_name: productName.toUpperCase() }), /already exists/)
  await refused('editors cannot add products', () => editor.client.rpc('create_product', { p_name: `Editor product ${RUN}` }))

  const deadline = new Date(Date.now() + 3 * 86_400_000)
  deadline.setUTCSeconds(0, 0)
  const packageArgs = {
    p_title: `E2E Spot ${RUN}`,
    p_product_id: productId,
    p_description: 'End-to-end test package. Safe to ignore.',
    p_brief_link: 'https://docs.google.com/document/d/e2e-brief',
    p_reference_links: ['https://f.io/e2e-ref-1', 'https://drive.google.com/e2e-ref-2'],
    p_deliverables: '16:9 master, 9:16 cutdown',
    p_editor_id: editor.id,
    p_responsible_manager_id: manager.id,
    p_deadline: deadline.toISOString(),
  }
  await refused('a package needs a valid brief link', () => manager.client.rpc('create_package', { ...packageArgs, p_brief_link: 'not a link' }), /brief link/i)
  await refused('a package needs a future deadline', () => manager.client.rpc('create_package', { ...packageArgs, p_deadline: new Date(Date.now() - 60_000).toISOString() }), /future/)
  const packageId = must(await manager.client.rpc('create_package', packageArgs), 'manager creates and assigns a package')
  await refused('admins cannot create packages', () => admin.client.rpc('create_package', packageArgs))
  await refused('editors cannot create packages', () => editor.client.rpc('create_package', packageArgs))

  // 4. Editor opens it; the other editor can't.
  const opened = must(
    await editor.client.from('packages').select('status, description, brief_link, reference_links, deliverables, deadline, editor_id').eq('id', packageId).maybeSingle(),
    'assigned editor opens the package',
  )
  check(
    opened.status === 'assigned' && opened.brief_link === packageArgs.p_brief_link && opened.reference_links.length === 2 && opened.description && opened.deliverables,
    'package keeps its description, brief, references, and deliverables',
    JSON.stringify(opened),
  )
  check(new Date(opened.deadline).getTime() === deadline.getTime(), 'package keeps its one final deadline')
  check(await waitFor(() => editorInbox.events.some((e) => e.new?.type === 'assigned')), 'editor gets the "assigned" notification live (Realtime)')
  const hidden = await other.client.from('packages').select('id').eq('id', packageId)
  check(!hidden.error && hidden.data.length === 0, "another editor cannot see the package")
  await refused('another editor cannot start it', () => other.client.rpc('start_work', { p_package_id: packageId }), /assigned editor/)

  // 5. Start and submit a review link (Round 1).
  await refused('cannot submit before starting', () => editor.client.rpc('submit_for_review', { p_package_id: packageId, p_review_link: 'https://f.io/r1', p_delivery_link: null }), /Start work/)
  must(await editor.client.rpc('start_work', { p_package_id: packageId }).then((r) => ({ ...r, data: r.error ? null : true })), 'editor starts work')
  await refused('starting twice is refused', () => editor.client.rpc('start_work', { p_package_id: packageId }), /already started/)
  await refused('a submission link must be a full https link', () => editor.client.rpc('submit_for_review', { p_package_id: packageId, p_review_link: 'f.io/r1', p_delivery_link: null }), /https/)
  const round1 = must(await editor.client.rpc('submit_for_review', { p_package_id: packageId, p_review_link: 'https://f.io/e2e-r1', p_delivery_link: null }), 'editor submits a review link (Round 1)')
  check(round1 === 1, 'the first submission is Round 1', String(round1))
  await refused('a second submit while waiting for review is refused', () => editor.client.rpc('submit_for_review', { p_package_id: packageId, p_review_link: 'https://f.io/dup', p_delivery_link: null }), /isn.t waiting/)
  check(await waitFor(() => managerInbox.events.some((e) => e.new?.type === 'submitted')), 'responsible manager gets the "submitted" notification live (Realtime)')
  check(await waitFor(() => managerActivity.events.some((e) => e.new?.package_id === packageId && e.new?.type === 'submitted')), "manager's live activity feed sees the submission")

  // 6. Editors can't review, change roles, or read other people's records.
  await refused('editor cannot approve work', () => editor.client.rpc('approve_package', { p_package_id: packageId }), /Only managers/)
  await refused('editor cannot mark Apply Feedback', () => editor.client.rpc('request_feedback', { p_package_id: packageId, p_note: 'self' }), /Only managers/)
  await refused('editor cannot change anyone’s role', () => editor.client.rpc('change_staff_role', { p_profile_id: other.id, p_role: 'manager' }), /Only admins/)
  await refused('editor cannot approve accounts', () => editor.client.rpc('approve_account', { p_profile_id: other.id, p_role: 'manager' }), /Only admins/)
  await refused('editor cannot edit profiles directly (own role)', () => editor.client.from('profiles').update({ role: 'manager' }).eq('id', editor.id).select())
  await refused('editor cannot write packages directly', () => editor.client.from('packages').update({ status: 'completed' }).eq('id', packageId).select())
  await refused('manager cannot change roles either', () => manager.client.rpc('change_staff_role', { p_profile_id: editor.id, p_role: 'manager' }), /Only admins/)
  const staffHistory = await editor.client.from('staff_activity').select('id').limit(1)
  check(!staffHistory.error && staffHistory.data.length === 0, 'editor cannot read the account history')

  // 7. Manager: approval needs a delivery link, then Apply Feedback.
  await refused('approval needs a delivery link', () => manager.client.rpc('approve_package', { p_package_id: packageId }), /delivery link/)
  must(await manager.client.rpc('request_feedback', { p_package_id: packageId, p_note: 'E2E: tighten the intro (see Frame.io)' }).then((r) => ({ ...r, data: r.error ? null : true })), 'manager marks Apply Feedback with a note')
  check(await waitFor(() => editorInbox.events.some((e) => e.new?.type === 'feedback')), 'editor gets the "feedback" notification live (Realtime)')

  // 8. Editor resubmits with a delivery link (Round 2), manager approves.
  const round2 = must(
    await editor.client.rpc('submit_for_review', { p_package_id: packageId, p_review_link: 'https://f.io/e2e-r1', p_delivery_link: 'https://drive.google.com/e2e-delivery' }),
    'editor resubmits after feedback (Round 2)',
  )
  check(round2 === 2, 'resubmitting creates the next round', String(round2))
  must(await manager.client.rpc('approve_package', { p_package_id: packageId }).then((r) => ({ ...r, data: r.error ? null : true })), 'manager approves')
  await refused('approving twice is refused', () => manager.client.rpc('approve_package', { p_package_id: packageId }), /Only submitted/)
  check(await waitFor(() => editorInbox.events.some((e) => e.new?.type === 'approved')), 'editor gets the "approved" notification live (Realtime)')

  const done = (await editor.client.from('packages').select('status, completed_at, rounds:submissions(round, review_link, delivery_link, outcome, feedback_note)').eq('id', packageId).single()).data
  check(done?.status === 'completed' && done.completed_at, 'package is Completed', JSON.stringify(done))
  const rounds = [...(done?.rounds ?? [])].sort((a, b) => a.round - b.round)
  check(
    rounds.length === 2 && rounds[0].outcome === 'feedback' && rounds[0].feedback_note?.startsWith('E2E') && rounds[1].outcome === 'approved' && rounds[1].delivery_link,
    'both rounds are kept with their links, outcomes, and the feedback note',
    JSON.stringify(rounds),
  )
  const finished = (await editor.client.from('packages').select('id').in('status', ['completed', 'cancelled', 'archived']).eq('editor_id', editor.id)).data ?? []
  check(finished.some((p) => p.id === packageId), "the package is in the editor's completed work (History)")
  check(otherActivity.events.every((e) => e.new?.package_id !== packageId), "another editor's live feed never received this package's activity (RLS)")

  // 9. Admin sees the work and history, read-only.
  const seen = (await admin.client.from('packages').select('status, rounds:submissions(round), activity(type, actor_id)').eq('id', packageId).single()).data
  const types = (seen?.activity ?? []).map((a) => a.type).sort()
  check(seen?.status === 'completed' && seen.rounds.length === 2, 'admin sees the package and both rounds')
  check(
    ['approved', 'created', 'feedback', 'started', 'submitted', 'submitted'].every((t, i, all) => types.filter((x) => x === t).length >= all.filter((x) => x === t).length),
    'admin sees the full activity history',
    types.join(', '),
  )
  await refused('admin cannot approve or review', () => admin.client.rpc('request_feedback', { p_package_id: packageId, p_note: '' }), /Only managers/)
  await refused('admin cannot clock in', () => admin.client.rpc('clock_in'), /managers and editors/)
  const adminRounds = (await admin.client.from('submissions').select('id').eq('submitted_by', editor.id)).data ?? []
  check(adminRounds.length >= 2, "admin sees the editor's submission rounds (Team → person)")

  // 10. Notifications reached the right people, and only them.
  const editorTypes = (await notificationsOf(editor)).filter((n) => n.package_id === packageId).map((n) => n.type).sort()
  const managerTypes = (await notificationsOf(manager)).filter((n) => n.package_id === packageId).map((n) => n.type).sort()
  check(editorTypes.join() === 'approved,assigned,feedback', 'editor was notified: assigned, feedback, approved', editorTypes.join())
  check(managerTypes.join() === 'submitted,submitted', 'manager was notified of both submissions', managerTypes.join())
  check((await notificationsOf(other)).every((n) => n.package_id !== packageId), 'the other editor got no notifications for it')
  const peek = await other.client.from('notifications').select('id').eq('recipient_id', editor.id)
  check(!peek.error && peek.data.length === 0, "an editor cannot read another person's notifications")
  must(await editor.client.rpc('mark_all_notifications_read').then((r) => ({ ...r, data: r.error ? null : r.data })), 'editor marks notifications read')
  check((await notificationsOf(editor)).every((n) => n.read_at), 'notifications keep their read state')

  // 11. Reassignment notifies both editors and keeps the rounds.
  const second = must(await manager.client.rpc('create_package', { ...packageArgs, p_title: `E2E Reassign ${RUN}` }), 'manager creates a second package')
  await editor.client.rpc('start_work', { p_package_id: second })
  await editor.client.rpc('submit_for_review', { p_package_id: second, p_review_link: 'https://f.io/e2e-before-reassign', p_delivery_link: null })
  await manager.client.rpc('request_feedback', { p_package_id: second, p_note: null })
  const newDeadline = new Date(deadline.getTime() + 86_400_000)
  must(
    await manager.client.rpc('update_package', { p_package_id: second, ...packageArgs, p_title: `E2E Reassign ${RUN}`, p_editor_id: other.id, p_deadline: newDeadline.toISOString() }).then((r) => ({ ...r, data: r.error ? null : r.data })),
    'manager reassigns it to the other editor and moves the deadline',
  )
  check((await notificationsOf(editor)).some((n) => n.package_id === second && n.type === 'reassigned_away'), 'the previous editor is told it was reassigned')
  check((await notificationsOf(other)).some((n) => n.package_id === second && n.type === 'assigned'), 'the new editor is told it was assigned to them')
  const moved = (await other.client.from('packages').select('rounds:submissions(round), activity(type, message)').eq('id', second).single()).data
  check(moved?.rounds.length === 1, 'earlier rounds stay on the package after reassignment')
  const manila = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    .format(newDeadline)
    .replace(/ /g, ' ')
    .replace(' at ', ', ')
  const deadlineEntry = moved?.activity.find((a) => a.type === 'deadline_changed')?.message ?? ''
  check(deadlineEntry.includes(`${manila} PHT`), 'deadline changes are recorded in Manila time (PHT)', `${deadlineEntry} (expected ${manila} PHT)`)

  // 12. Attendance: one open session, survives a fresh session ("refresh"), team visibility.
  await editor.client.rpc('clock_out') // in case an earlier run left one open
  must(await editor.client.rpc('clock_in'), 'editor clocks in')
  await refused('a second clock-in is refused while one is open', () => editor.client.rpc('clock_in'), /already clocked in/)
  const parallel = await Promise.all([manager.client.rpc('clock_in'), manager.client.rpc('clock_in')])
  check(parallel.filter((r) => !r.error).length === 1, 'two clock-ins at the same moment create only one session')
  const loser = parallel.find((r) => r.error)?.error?.message ?? ''
  check(/already clocked in/i.test(loser), 'the second of two simultaneous clock-ins gets a readable message', loser)
  const reopened = await signIn(editor.email, editor.password)
  const open = (await reopened.client.from('attendance_sessions').select('id, clock_in, clock_out').eq('person_id', editor.id).is('clock_out', null)).data ?? []
  check(open.length === 1, 'the open session is still there after signing in again (survives refresh)')
  const team = (await manager.client.from('attendance_sessions').select('person_id').in('person_id', [editor.id, manager.id]).is('clock_out', null)).data ?? []
  check(team.length === 2, "managers see the team's open sessions")
  const spy = await other.client.from('attendance_sessions').select('id').eq('person_id', editor.id)
  check(!spy.error && spy.data.length === 0, "an editor cannot see another editor's attendance")
  must(await editor.client.rpc('clock_out').then((r) => ({ ...r, data: r.error ? null : true })), 'editor clocks out')
  await refused('clocking out twice is refused', () => editor.client.rpc('clock_out'), /aren.t clocked in/)
  await manager.client.rpc('clock_out')

  // 13. Deactivated and unapproved accounts can't read business data.
  must(await admin.client.rpc('deactivate_account', { p_profile_id: other.id }).then((r) => ({ ...r, data: r.error ? null : true })), 'admin deactivates the other editor')
  const after = await Promise.all([
    other.client.from('packages').select('id'),
    other.client.from('notifications').select('id'),
    other.client.from('attendance_sessions').select('id'),
    other.client.from('products').select('id'),
  ])
  check(after.every((r) => !r.error && r.data.length === 0), 'a deactivated account (still holding a valid token) reads no business data')
  await refused('a deactivated account cannot clock in', () => other.client.rpc('clock_in'))
  const otherPeople = await other.client.from('profiles').select('id')
  check(!otherPeople.error && otherPeople.data.length === 1, 'a deactivated account sees only its own profile')

  if (PENDING) {
    const pending = await signIn(PENDING.email, PENDING.password)
    if (pending.error) record('fail', 'unapproved account signs in', pending.error.message)
    else {
      const reads = await Promise.all(['packages', 'notifications', 'attendance_sessions', 'products', 'submissions', 'activity'].map((t) => pending.client.from(t).select('id').limit(5)))
      check(reads.every((r) => !r.error && r.data.length === 0), 'an unapproved account reads no business data')
      const profiles = (await pending.client.from('profiles').select('id, role')).data ?? []
      check(profiles.length === 1 && profiles[0].role === null, 'an unapproved account sees only its own profile, with no role')
      await refused('an unapproved account cannot clock in', () => pending.client.rpc('clock_in'))
      await refused('an unapproved account cannot approve itself', () => pending.client.rpc('approve_account', { p_profile_id: pending.user.id, p_role: 'manager' }))
    }
  } else record('skip', 'unapproved account checks', 'set CNE_PENDING_EMAIL and CNE_PENDING_PASSWORD')

  for (const l of [editorInbox, managerInbox, managerActivity, otherActivity]) await l.stop()
}

async function cleanup() {
  if (!admin?.client || process.env.CNE_KEEP_ACCOUNTS === '1') return
  for (const id of created) {
    const { data } = await admin.client.from('profiles').select('is_active').eq('id', id).single()
    if (data?.is_active) await admin.client.rpc('deactivate_account', { p_profile_id: id })
  }
  console.log(`\nDeactivated the ${created.length} test accounts (cne-e2e-${RUN}-*). Their records stay.`)
}

try {
  await main()
} catch (error) {
  record('fail', 'run stopped early', error.message)
} finally {
  await cleanup().catch((error) => console.error(`Cleanup failed: ${error.message}`))
  const failed = results.filter((r) => r.status === 'fail').length
  const passed = results.filter((r) => r.status === 'pass').length
  console.log(`\n${passed} passed, ${failed} failed, ${results.filter((r) => r.status === 'skip').length} skipped`)
  process.exit(failed ? 1 : 0)
}
