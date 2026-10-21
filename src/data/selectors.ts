// Read-only derivations over AppState. Kept free of React so they can be
// reused (and later replaced by Supabase queries/views).
import { DAY_MS, HOUR_MS, manilaDateKey } from '../lib/time'
import type { AppState, PackageStatus, Person, StaffAccount, WorkPackage } from './types'

const ACTIVE: ReadonlySet<PackageStatus> = new Set(['assigned', 'in_progress', 'submitted', 'apply_feedback'])

export const isActive = (pkg: WorkPackage) => ACTIVE.has(pkg.status)

/** Overdue is derived, not a status: past deadline while still active. */
export const isOverdue = (pkg: WorkPackage, now: Date) => isActive(pkg) && new Date(pkg.deadline).getTime() < now.getTime()

export const isDueWithin = (pkg: WorkPackage, now: Date, ms: number) => {
  const left = new Date(pkg.deadline).getTime() - now.getTime()
  return isActive(pkg) && left >= 0 && left <= ms
}

export interface Lookup {
  person: (id: string) => Person | undefined
  personName: (id: string) => string
  productName: (id: string) => string
}

export function makeLookup(s: AppState): Lookup {
  const people = new Map(s.people.map((p) => [p.id, p]))
  const products = new Map(s.products.map((p) => [p.id, p.name]))
  return {
    person: (id) => people.get(id),
    personName: (id) => people.get(id)?.name ?? 'Unknown',
    productName: (id) => products.get(id) ?? 'Unknown product',
  }
}

/** Active managers and editors: the people who can be given work. */
export const managers = (s: AppState) => s.people.filter((p) => p.role === 'manager' && p.isActive)
export const editors = (s: AppState) => s.people.filter((p) => p.role === 'editor' && p.isActive)

export const byDeadline = (a: WorkPackage, b: WorkPackage) => a.deadline.localeCompare(b.deadline)

export function submissionsFor(s: AppState, packageId: string) {
  return s.submissions.filter((x) => x.packageId === packageId).sort((a, b) => b.round - a.round)
}

export function activityFor(s: AppState, packageId: string) {
  return s.activity.filter((x) => x.packageId === packageId).sort((a, b) => b.at.localeCompare(a.at))
}

export function lastSubmittedAt(s: AppState, packageId: string): string | null {
  return submissionsFor(s, packageId)[0]?.submittedAt ?? null
}

export function roundCount(s: AppState, packageId: string) {
  return s.submissions.filter((x) => x.packageId === packageId).length
}

/** Who may open a package: managers, admins (read-only), or the currently assigned editor. RLS enforces the same rule. */
export function canView(person: Person, pkg: WorkPackage) {
  return person.role === 'manager' || person.role === 'admin' || pkg.editorId === person.id
}

// ── Package list filtering (URL-driven) ─────────────────────────────────────

export type DueFilter = '' | 'overdue' | '48h' | 'week'

export interface PackageFilters {
  q: string
  product: string
  editor: string
  manager: string
  status: '' | PackageStatus | 'active'
  due: DueFilter
}

export const EMPTY_FILTERS: PackageFilters = { q: '', product: '', editor: '', manager: '', status: '', due: '' }

export function filterPackages(s: AppState, f: PackageFilters, now: Date) {
  const q = f.q.trim().toLowerCase()
  return s.packages
    .filter((p) => {
      if (f.product && p.productId !== f.product) return false
      if (f.editor && p.editorId !== f.editor) return false
      if (f.manager && p.responsibleManagerId !== f.manager) return false
      if (f.status === 'active' ? !isActive(p) : f.status && p.status !== f.status) return false
      if (f.due === 'overdue' && !isOverdue(p, now)) return false
      if (f.due === '48h' && !isDueWithin(p, now, 48 * HOUR_MS)) return false
      if (f.due === 'week' && !isDueWithin(p, now, 7 * DAY_MS)) return false
      if (q && !`${p.title} ${p.code}`.toLowerCase().includes(q)) return false
      return true
    })
    .sort((a, b) => {
      // Active work first (by deadline), then finished work (most recent first).
      if (isActive(a) !== isActive(b)) return isActive(a) ? -1 : 1
      return isActive(a) ? byDeadline(a, b) : b.updatedAt.localeCompare(a.updatedAt)
    })
}

// ── Workload ────────────────────────────────────────────────────────────────

export interface EditorWorkload {
  editor: Person
  active: number
  dueSoon: number
  overdue: number
  needsChanges: number
  /** Submitted and waiting for a manager. */
  awaitingReview: number
}

/** PRD: workload is the count of active packages per editor. */
export function editorWorkload(s: AppState, now: Date): EditorWorkload[] {
  return editors(s)
    .map((editor) => {
      const mine = s.packages.filter((p) => p.editorId === editor.id && isActive(p))
      return {
        editor,
        active: mine.length,
        dueSoon: mine.filter((p) => isDueWithin(p, now, 48 * HOUR_MS)).length,
        overdue: mine.filter((p) => isOverdue(p, now)).length,
        needsChanges: mine.filter((p) => p.status === 'apply_feedback').length,
        awaitingReview: mine.filter((p) => p.status === 'submitted').length,
      }
    })
    .sort((a, b) => b.active - a.active || a.editor.name.localeCompare(b.editor.name))
}

// ── Oversight (admin, read-only) ────────────────────────────────────────────

export interface ManagerLoad {
  manager: Person
  /** Active packages they're responsible for. */
  responsible: number
  /** Submitted packages they're responsible for. */
  awaitingReview: number
  overdue: number
  /** Rounds they approved or sent back in the last 30 days. */
  decisions: number
}

export function managerLoad(s: AppState, now: Date): ManagerLoad[] {
  return managers(s)
    .map((manager) => {
      const mine = s.packages.filter((p) => p.responsibleManagerId === manager.id && isActive(p))
      return {
        manager,
        responsible: mine.length,
        awaitingReview: mine.filter((p) => p.status === 'submitted').length,
        overdue: mine.filter((p) => isOverdue(p, now)).length,
        decisions: decisionsBy(s, manager.id).filter((d) => now.getTime() - new Date(d.decidedAt ?? 0).getTime() <= 30 * DAY_MS).length,
      }
    })
    .sort((a, b) => b.awaitingReview - a.awaitingReview || a.manager.name.localeCompare(b.manager.name))
}

/** Rounds someone submitted, newest first. */
export const submissionsBy = (s: AppState, personId: string) =>
  s.submissions.filter((x) => x.submittedById === personId).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))

/** Rounds someone approved or sent back for changes, newest first. */
export const decisionsBy = (s: AppState, personId: string) =>
  s.submissions
    .filter((x) => x.decidedById === personId && x.decidedAt)
    .sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''))

/** Account access: approved and active, waiting for a role, or deactivated. */
export type Access = 'active' | 'pending' | 'deactivated'
export const accessOf = (a: Pick<StaffAccount, 'role' | 'isActive'>): Access => (a.isActive ? 'active' : a.role ? 'deactivated' : 'pending')

export function staffActivityFor(s: AppState, profileId?: string) {
  return s.staffActivity.filter((x) => !profileId || x.profileId === profileId).sort((a, b) => b.at.localeCompare(a.at))
}

// ── Attendance ──────────────────────────────────────────────────────────────

export function sessionsFor(s: AppState, personId: string) {
  return s.attendance.filter((a) => a.personId === personId).sort((a, b) => b.clockIn.localeCompare(a.clockIn))
}

export function currentlyClockedIn(s: AppState) {
  return s.attendance.filter((a) => a.clockOut === null).sort((a, b) => a.clockIn.localeCompare(b.clockIn))
}

/** Session length so far; sessions count toward their clock-in date. */
export function sessionDurationMs(session: { clockIn: string; clockOut: string | null }, now: Date) {
  const end = session.clockOut ? new Date(session.clockOut).getTime() : now.getTime()
  return end - new Date(session.clockIn).getTime()
}

export function totalDurationMs(sessions: Array<{ clockIn: string; clockOut: string | null }>, now: Date) {
  return sessions.reduce((sum, session) => sum + sessionDurationMs(session, now), 0)
}

export const crossesMidnight = (session: { clockIn: string; clockOut: string | null }, now: Date) =>
  manilaDateKey(session.clockIn) !== manilaDateKey(session.clockOut ?? now.toISOString())

// ── Notifications ───────────────────────────────────────────────────────────

export function notificationsFor(s: AppState, personId: string) {
  return s.notifications.filter((n) => n.recipientId === personId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export const unreadCount = (s: AppState, personId: string) =>
  s.notifications.filter((n) => n.recipientId === personId && !n.readAt).length
