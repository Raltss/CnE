// Pure workflow rules for the localStorage demo. Each command mutates the given
// draft state and returns a result; the demo store clones state before calling
// and only commits on success. The same commands build the seed data.
// With Supabase, the database enforces these same rules in
// supabase/migrations/20261021100200_workflow_functions.sql (packages, attendance)
// and 20261021120000_admin_oversight.sql (staff access). Keep them in step.
import { HOUR_MS, formatDateTime } from '../lib/time'
import type {
  ActionResult,
  ActivityType,
  AppState,
  AssignableRole,
  DemoState,
  NotificationType,
  PackageInput,
  PackageStatus,
  Role,
  StaffAccount,
  StaffChangeType,
  SubmissionInput,
  WorkPackage,
} from './types'
import { validatePackageInput, validateSubmissionInput } from './validation'

export const AUTO_CLOSE_HOURS = 16

let idCounter = 0
export function newId(prefix: string): string {
  idCounter += 1
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${idCounter}`
}

const ok = <T>(value: T): ActionResult<T> => ({ ok: true, value })
const fail = (error: string, fieldErrors?: Record<string, string>): ActionResult<never> => ({
  ok: false,
  error,
  fieldErrors,
})

export const ACTIVE_STATUSES: PackageStatus[] = ['assigned', 'in_progress', 'submitted', 'apply_feedback']

const nameOf = (s: DemoState, id: string) => s.people.find((p) => p.id === id)?.name ?? 'Unknown'

function logActivity(s: DemoState, pkg: WorkPackage, type: ActivityType, actorId: string, at: string, message: string) {
  s.activity.push({ id: newId('act'), packageId: pkg.id, type, actorId, at, message })
}

function notify(
  s: DemoState,
  recipientId: string,
  type: NotificationType,
  pkg: WorkPackage,
  actorId: string,
  at: string,
  message: string,
) {
  // People are never notified about their own actions.
  if (recipientId === actorId) return
  s.notifications.push({
    id: newId('ntf'),
    recipientId,
    type,
    packageId: pkg.id,
    actorId,
    message,
    createdAt: at,
    readAt: null,
  })
}

/** Like private.require_role(): approved, active staff with this role. */
function requireRole(s: DemoState, actorId: string, role: Role) {
  const actor = s.people.find((p) => p.id === actorId)
  return actor?.role === role && actor.isActive ? actor : null
}

function findPackage(s: DemoState, packageId: string) {
  return s.packages.find((p) => p.id === packageId) ?? null
}

export function latestSubmission(s: AppState, packageId: string) {
  return s.submissions
    .filter((sub) => sub.packageId === packageId)
    .reduce<AppState['submissions'][number] | null>((latest, sub) => (!latest || sub.round > latest.round ? sub : latest), null)
}

function cleanInput(input: PackageInput): PackageInput {
  return {
    ...input,
    title: input.title.trim(),
    description: input.description.trim(),
    briefLink: input.briefLink.trim(),
    referenceLinks: input.referenceLinks.map((l) => l.trim()).filter(Boolean),
    deliverables: input.deliverables.trim(),
  }
}

// ── Packages ────────────────────────────────────────────────────────────────

export function createPackage(s: DemoState, actorId: string, raw: PackageInput, at: string): ActionResult<WorkPackage> {
  if (!requireRole(s, actorId, 'manager')) return fail('Only managers can create packages.')
  const fieldErrors = validatePackageInput(s, raw, { now: new Date(at) })
  if (Object.keys(fieldErrors).length) return fail('Fix the highlighted fields.', fieldErrors as Record<string, string>)
  const input = cleanInput(raw)
  const pkg: WorkPackage = {
    id: newId('pkg'),
    code: `PKG-${s.nextPackageNumber}`,
    ...input,
    status: 'assigned',
    createdAt: at,
    createdById: actorId,
    updatedAt: at,
    completedAt: null,
  }
  s.nextPackageNumber += 1
  s.packages.push(pkg)
  logActivity(s, pkg, 'created', actorId, at, `Created and assigned to ${nameOf(s, pkg.editorId)}`)
  notify(s, pkg.editorId, 'assigned', pkg, actorId, at, `New package assigned: ${pkg.title}`)
  return ok(pkg)
}

export function updatePackage(
  s: DemoState,
  actorId: string,
  packageId: string,
  raw: PackageInput,
  at: string,
): ActionResult<WorkPackage> {
  if (!requireRole(s, actorId, 'manager')) return fail('Only managers can edit packages.')
  const pkg = findPackage(s, packageId)
  if (!pkg) return fail('This package no longer exists.')
  if (pkg.status === 'completed') return fail('Completed packages can’t be edited in this milestone.')
  const fieldErrors = validatePackageInput(s, raw, { now: new Date(at), previousDeadline: pkg.deadline })
  if (Object.keys(fieldErrors).length) return fail('Fix the highlighted fields.', fieldErrors as Record<string, string>)
  const input = cleanInput(raw)
  const before = { ...pkg }

  const changed: string[] = []
  if (input.title !== before.title) changed.push('title')
  if (input.clientId !== before.clientId || input.productId !== before.productId) changed.push('client/product')
  if (input.description !== before.description) changed.push('description')
  if (input.briefLink !== before.briefLink) changed.push('brief link')
  if (input.referenceLinks.join('\n') !== before.referenceLinks.join('\n')) changed.push('reference links')
  if (input.deliverables !== before.deliverables) changed.push('deliverables')

  Object.assign(pkg, input, { updatedAt: at })

  if (input.editorId !== before.editorId) {
    logActivity(s, pkg, 'reassigned', actorId, at, `Reassigned from ${nameOf(s, before.editorId)} to ${nameOf(s, input.editorId)}`)
    notify(s, before.editorId, 'reassigned_away', pkg, actorId, at, `${pkg.title} was reassigned to ${nameOf(s, input.editorId)}`)
    notify(s, input.editorId, 'assigned', pkg, actorId, at, `Package reassigned to you: ${pkg.title}`)
  }
  if (input.deadline !== before.deadline) {
    logActivity(
      s,
      pkg,
      'deadline_changed',
      actorId,
      at,
      `Deadline changed from ${formatDateTime(before.deadline)} to ${formatDateTime(input.deadline)}`,
    )
    notify(s, pkg.editorId, 'deadline_changed', pkg, actorId, at, `Deadline for ${pkg.title} is now ${formatDateTime(input.deadline)}`)
  }
  if (input.responsibleManagerId !== before.responsibleManagerId) {
    logActivity(
      s,
      pkg,
      'manager_changed',
      actorId,
      at,
      `Responsible manager changed from ${nameOf(s, before.responsibleManagerId)} to ${nameOf(s, input.responsibleManagerId)}`,
    )
    notify(s, input.responsibleManagerId, 'manager_changed', pkg, actorId, at, `You are now responsible for ${pkg.title}`)
  }
  if (changed.length) logActivity(s, pkg, 'edited', actorId, at, `Updated ${changed.join(', ')}`)
  return ok(pkg)
}

// ── Status transitions ──────────────────────────────────────────────────────

export function startWork(s: DemoState, actorId: string, packageId: string, at: string): ActionResult<WorkPackage> {
  const pkg = findPackage(s, packageId)
  if (!pkg) return fail('This package no longer exists.')
  if (!requireRole(s, actorId, 'editor') || pkg.editorId !== actorId) return fail('Only the assigned editor can start this package.')
  if (pkg.status !== 'assigned') return fail('Work has already started on this package.')
  pkg.status = 'in_progress'
  pkg.updatedAt = at
  logActivity(s, pkg, 'started', actorId, at, 'Started work')
  return ok(pkg)
}

export function submitForReview(
  s: DemoState,
  actorId: string,
  packageId: string,
  input: SubmissionInput,
  at: string,
): ActionResult<WorkPackage> {
  const pkg = findPackage(s, packageId)
  if (!pkg) return fail('This package no longer exists.')
  if (!requireRole(s, actorId, 'editor') || pkg.editorId !== actorId) return fail('Only the assigned editor can submit this package.')
  if (pkg.status !== 'in_progress' && pkg.status !== 'apply_feedback')
    return fail(pkg.status === 'assigned' ? 'Start work before submitting.' : 'This package isn’t waiting for a submission.')
  const fieldErrors = validateSubmissionInput(input)
  if (Object.keys(fieldErrors).length) return fail(fieldErrors.form ?? 'Fix the highlighted links.', fieldErrors as Record<string, string>)

  const round = (latestSubmission(s, pkg.id)?.round ?? 0) + 1
  s.submissions.push({
    id: newId('sub'),
    packageId: pkg.id,
    round,
    reviewLink: input.reviewLink.trim() || null,
    deliveryLink: input.deliveryLink.trim() || null,
    submittedAt: at,
    submittedById: actorId,
    outcome: 'pending',
    decidedAt: null,
    decidedById: null,
    feedbackNote: null,
  })
  const wasFeedback = pkg.status === 'apply_feedback'
  pkg.status = 'submitted'
  pkg.updatedAt = at
  logActivity(s, pkg, 'submitted', actorId, at, `${wasFeedback ? 'Resubmitted' : 'Submitted'} Round ${round} for review`)
  notify(
    s,
    pkg.responsibleManagerId,
    'submitted',
    pkg,
    actorId,
    at,
    `${nameOf(s, actorId)} ${wasFeedback ? 'resubmitted' : 'submitted'} ${pkg.title} (Round ${round})`,
  )
  return ok(pkg)
}

export function requestFeedback(
  s: DemoState,
  actorId: string,
  packageId: string,
  note: string,
  at: string,
): ActionResult<WorkPackage> {
  if (!requireRole(s, actorId, 'manager')) return fail('Only managers can request feedback changes.')
  const pkg = findPackage(s, packageId)
  if (!pkg) return fail('This package no longer exists.')
  if (pkg.status !== 'submitted') return fail('Only submitted packages can be sent back for changes.')
  const trimmed = note.trim()
  if (trimmed.length > 500) return fail('Keep the note under 500 characters.', { note: 'Keep the note under 500 characters.' })
  const sub = latestSubmission(s, pkg.id)
  if (sub) Object.assign(sub, { outcome: 'feedback', decidedAt: at, decidedById: actorId, feedbackNote: trimmed || null })
  pkg.status = 'apply_feedback'
  pkg.updatedAt = at
  logActivity(s, pkg, 'feedback', actorId, at, `Marked Apply Feedback on Round ${sub?.round ?? '?'}`)
  notify(s, pkg.editorId, 'feedback', pkg, actorId, at, `Feedback changes requested on ${pkg.title}`)
  return ok(pkg)
}

/** PRD default: a round can only be approved when it has a delivery link. */
export function approvalBlocker(s: AppState, pkg: WorkPackage): string | null {
  if (pkg.status !== 'submitted') return 'Only submitted packages can be approved.'
  const sub = latestSubmission(s, pkg.id)
  if (!sub?.deliveryLink) return 'This round has no delivery link. Mark Apply Feedback so the editor can resubmit with one.'
  return null
}

export function approvePackage(s: DemoState, actorId: string, packageId: string, at: string): ActionResult<WorkPackage> {
  if (!requireRole(s, actorId, 'manager')) return fail('Only managers can approve packages.')
  const pkg = findPackage(s, packageId)
  if (!pkg) return fail('This package no longer exists.')
  const blocker = approvalBlocker(s, pkg)
  if (blocker) return fail(blocker)
  const sub = latestSubmission(s, pkg.id)!
  Object.assign(sub, { outcome: 'approved', decidedAt: at, decidedById: actorId })
  pkg.status = 'completed'
  pkg.completedAt = at
  pkg.updatedAt = at
  logActivity(s, pkg, 'approved', actorId, at, `Approved Round ${sub.round}. Package completed`)
  notify(s, pkg.editorId, 'approved', pkg, actorId, at, `${pkg.title} was approved`)
  return ok(pkg)
}

// ── Attendance ──────────────────────────────────────────────────────────────

export function openSession(s: AppState, personId: string) {
  return s.attendance.find((a) => a.personId === personId && a.clockOut === null) ?? null
}

export function clockIn(s: DemoState, personId: string, at: string): ActionResult<undefined> {
  if (!requireRole(s, personId, 'manager') && !requireRole(s, personId, 'editor')) return fail('Only managers and editors clock in.')
  const open = openSession(s, personId)
  if (open) return fail(`You’re already clocked in since ${formatDateTime(open.clockIn)}.`)
  s.attendance.push({ id: newId('att'), personId, clockIn: at, clockOut: null, autoClosed: false })
  return ok(undefined)
}

export function clockOut(s: DemoState, personId: string, at: string): ActionResult<undefined> {
  if (!requireRole(s, personId, 'manager') && !requireRole(s, personId, 'editor')) return fail('Only managers and editors clock out.')
  const open = openSession(s, personId)
  if (!open) return fail('You aren’t clocked in.')
  open.clockOut = at
  return ok(undefined)
}

/** Close sessions left open past the limit at clock-in + 16h. Returns how many closed. */
export function autoCloseStaleSessions(s: DemoState, now: Date): number {
  let closed = 0
  for (const session of s.attendance) {
    if (session.clockOut) continue
    const limit = new Date(session.clockIn).getTime() + AUTO_CLOSE_HOURS * HOUR_MS
    if (now.getTime() >= limit) {
      session.clockOut = new Date(limit).toISOString()
      session.autoClosed = true
      closed += 1
    }
  }
  return closed
}

// ── Notifications ───────────────────────────────────────────────────────────

export function markNotificationRead(s: DemoState, actorId: string, notificationId: string, at: string): ActionResult<undefined> {
  const n = s.notifications.find((x) => x.id === notificationId && x.recipientId === actorId)
  if (!n) return fail('Notification not found.')
  n.readAt ??= at
  return ok(undefined)
}

export function markAllNotificationsRead(s: DemoState, actorId: string, at: string): ActionResult<undefined> {
  for (const n of s.notifications) if (n.recipientId === actorId && !n.readAt) n.readAt = at
  return ok(undefined)
}

// ── Staff access (admin) ────────────────────────────────────────────────────
// Mirrors approve_account / change_staff_role / deactivate_account /
// reactivate_account and the audit trigger on profiles. Admin access itself is
// never granted here: in Supabase that happens only in the SQL editor.

const DONE_STATUSES: PackageStatus[] = ['completed', 'cancelled', 'archived']

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const roleLabel = (role: Role | null) => (role ? role[0].toUpperCase() + role.slice(1) : 'no role')

/** Same wording as private.audit_profile_changes(). */
function accessChange(before: StaffAccount, after: StaffAccount): { type: StaffChangeType; message: string } {
  if (!before.role && after.role)
    return { type: 'approved', message: `Approved as ${roleLabel(after.role)}${after.isActive ? '' : ' (not active yet)'}` }
  if (before.isActive && !after.isActive)
    return {
      type: 'deactivated',
      message: `Deactivated${after.role !== before.role ? `, and role changed from ${roleLabel(before.role)} to ${roleLabel(after.role)}` : ''}`,
    }
  if (after.isActive && !before.isActive)
    return {
      type: 'reactivated',
      message: `Reactivated as ${roleLabel(after.role)}${after.role !== before.role ? ` (was ${roleLabel(before.role)})` : ''}`,
    }
  return { type: 'role_changed', message: `Role changed from ${roleLabel(before.role)} to ${roleLabel(after.role)}` }
}

/** Apply an access change, keep `people` in step, and record it under the admin. */
function applyAccess(s: DemoState, account: StaffAccount, next: Pick<StaffAccount, 'role' | 'isActive'>, actorId: string, at: string) {
  const before = { ...account }
  Object.assign(account, next)
  const { type, message } = accessChange(before, account)
  s.staffActivity.push({
    id: newId('stf'),
    profileId: account.id,
    actorId,
    type,
    oldRole: before.role,
    newRole: account.role,
    oldIsActive: before.isActive,
    newIsActive: account.isActive,
    message,
    at,
  })
  s.people = s.accounts.flatMap((a) => (a.role ? [{ id: a.id, name: a.name, role: a.role, title: a.title, isActive: a.isActive }] : []))
}

/** Shared checks, like private.lock_staff_target(). */
function staffTarget(s: DemoState, actorId: string, profileId: string, action: string): StaffAccount | string {
  if (!requireRole(s, actorId, 'admin')) return `Only admins can ${action}.`
  const account = s.accounts.find((a) => a.id === profileId)
  if (!account) return 'This account no longer exists.'
  if (account.id === actorId) return 'You can’t change your own role or access.'
  if (account.role === 'admin') return 'Admin accounts are managed in the Supabase SQL editor, not in the app.'
  return account
}

const assignable = (role: string): role is AssignableRole => role === 'manager' || role === 'editor'
const ROLE_ERROR = 'Choose manager or editor. Admin access can only be granted in the Supabase SQL editor.'

export function approveAccount(s: DemoState, actorId: string, profileId: string, role: AssignableRole, at: string): ActionResult<undefined> {
  if (!requireRole(s, actorId, 'admin')) return fail('Only admins can approve accounts.')
  if (!assignable(role)) return fail(ROLE_ERROR)
  const account = staffTarget(s, actorId, profileId, 'approve accounts')
  if (typeof account === 'string') return fail(account)
  if (account.role) return fail(`${account.name} already has a role. Use Change role instead.`)
  applyAccess(s, account, { role, isActive: true }, actorId, at)
  return ok(undefined)
}

/** Why an account can't switch roles right now, or null. Also used by the UI to explain a disabled option. */
export function roleChangeBlocker(s: AppState, account: StaffAccount): string | null {
  if (!account.role || account.role === 'admin') return null
  const open = s.packages.filter(
    (p) => !DONE_STATUSES.includes(p.status) && (account.role === 'editor' ? p.editorId : p.responsibleManagerId) === account.id,
  ).length
  if (open > 0 && account.role === 'editor')
    return `Reassign ${account.name}’s ${plural(open, 'open package', 'open packages')} to another editor first.`
  if (open > 0) return `Make another manager responsible for ${account.name}’s ${plural(open, 'open package', 'open packages')} first.`
  if (account.role === 'manager') {
    const owned = s.clients.filter((c) => c.managerId === account.id).length + s.products.filter((p) => p.managerId === account.id).length
    if (owned > 0)
      return `${account.name} is the assigned manager for ${plural(owned, 'client or product', 'clients and products')}. Assign another manager to them first.`
  }
  return null
}

export function changeStaffRole(s: DemoState, actorId: string, profileId: string, role: AssignableRole, at: string): ActionResult<undefined> {
  if (!requireRole(s, actorId, 'admin')) return fail('Only admins can change roles.')
  if (!assignable(role)) return fail(ROLE_ERROR)
  const account = staffTarget(s, actorId, profileId, 'change roles')
  if (typeof account === 'string') return fail(account)
  if (!account.role) return fail('Approve this account before changing its role.')
  if (account.role === role) return fail(`${account.name} is already ${role === 'editor' ? 'an editor' : 'a manager'}.`)
  const blocker = roleChangeBlocker(s, account)
  if (blocker) return fail(blocker)
  applyAccess(s, account, { role, isActive: account.isActive }, actorId, at)
  return ok(undefined)
}

export function deactivateAccount(s: DemoState, actorId: string, profileId: string, at: string): ActionResult<undefined> {
  const account = staffTarget(s, actorId, profileId, 'deactivate accounts')
  if (typeof account === 'string') return fail(account)
  if (!account.isActive) return fail(`${account.name} isn’t active.`)
  applyAccess(s, account, { role: account.role, isActive: false }, actorId, at)
  return ok(undefined)
}

export function reactivateAccount(s: DemoState, actorId: string, profileId: string, at: string): ActionResult<undefined> {
  const account = staffTarget(s, actorId, profileId, 'reactivate accounts')
  if (typeof account === 'string') return fail(account)
  if (!account.role) return fail('This account has never been approved. Approve it instead.')
  if (account.isActive) return fail(`${account.name} is already active.`)
  applyAccess(s, account, { role: account.role, isActive: true }, actorId, at)
  return ok(undefined)
}
