// Pure helpers over loaded rows: no React and no network, so pages can combine
// whatever their queries returned. The database does the filtering that limits
// what each person may see (RLS); these only shape and count what came back.
import { DAY_MS, HOUR_MS, manilaDateKey } from '../lib/time'
import type { PackageStatus, PackageSummary, Person, Product, RoundSummary, StaffAccount } from './types'

/** Statuses that count as current work (workload, overdue, review queue). */
export const ACTIVE_STATUSES: PackageStatus[] = ['assigned', 'in_progress', 'submitted', 'apply_feedback']
/** Statuses a package can't leave without a manager reopening it: finished work, paged in history lists. */
export const FINISHED_STATUSES: PackageStatus[] = ['completed', 'cancelled', 'archived']

export const isActive = (pkg: Pick<PackageSummary, 'status'>) => ACTIVE_STATUSES.includes(pkg.status)

/** Overdue is derived, not a status: past deadline while still active. */
export const isOverdue = (pkg: PackageSummary, now: Date) => isActive(pkg) && new Date(pkg.deadline).getTime() < now.getTime()

export const isDueWithin = (pkg: PackageSummary, now: Date, ms: number) => {
  const left = new Date(pkg.deadline).getTime() - now.getTime()
  return isActive(pkg) && left >= 0 && left <= ms
}

export const byDeadline = (a: PackageSummary, b: PackageSummary) => a.deadline.localeCompare(b.deadline)

export interface Lookup {
  person: (id: string) => Person | undefined
  personName: (id: string) => string
  productName: (id: string) => string
}

export function makeLookup(people: Person[], products: Product[]): Lookup {
  const byId = new Map(people.map((p) => [p.id, p]))
  const productNames = new Map(products.map((p) => [p.id, p.name]))
  return {
    person: (id) => byId.get(id),
    personName: (id) => byId.get(id)?.name ?? 'Unknown',
    productName: (id) => productNames.get(id) ?? 'Unknown product',
  }
}

/** Active managers and editors: the people who can be given work. */
export const managers = (people: Person[]) => people.filter((p) => p.role === 'manager' && p.isActive)
export const editors = (people: Person[]) => people.filter((p) => p.role === 'editor' && p.isActive)

/** PRD default: a round can only be approved when it has a delivery link. */
export function approvalBlocker(latest: RoundSummary | null): string | null {
  if (!latest) return 'Nothing has been submitted yet.'
  if (!latest.deliveryLink) return 'This round has no delivery link. Mark Apply Feedback so the editor can resubmit with one.'
  return null
}

// ── Filtering current work (URL-driven) ─────────────────────────────────────

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

/** Filters for finished work, which is paged from the server instead of filtered here. */
export interface FinishedFilters {
  q?: string
  product?: string
  editor?: string
  manager?: string
  createdBy?: string
  status?: PackageStatus
}

/** Whether a status filter can only match current work, or only finished work. */
export const showsActive = (f: PackageFilters) => !f.status || f.status === 'active' || ACTIVE_STATUSES.includes(f.status as PackageStatus)
export const showsFinished = (f: PackageFilters) => !f.due && (!f.status || FINISHED_STATUSES.includes(f.status as PackageStatus))

/** Applies the filters to the (complete) list of current packages, soonest deadline first. */
export function filterActive(packages: PackageSummary[], f: PackageFilters, now: Date) {
  const q = f.q.trim().toLowerCase()
  return packages
    .filter((p) => {
      if (!isActive(p)) return false
      if (f.product && p.productId !== f.product) return false
      if (f.editor && p.editorId !== f.editor) return false
      if (f.manager && p.responsibleManagerId !== f.manager) return false
      if (f.status && f.status !== 'active' && p.status !== f.status) return false
      if (f.due === 'overdue' && !isOverdue(p, now)) return false
      if (f.due === '48h' && !isDueWithin(p, now, 48 * HOUR_MS)) return false
      if (f.due === 'week' && !isDueWithin(p, now, 7 * DAY_MS)) return false
      if (q && !`${p.title} ${p.code}`.toLowerCase().includes(q)) return false
      return true
    })
    .sort(byDeadline)
}

/** Submitted packages: the manager's own first, then oldest submission first. */
export function reviewQueue(packages: PackageSummary[], managerId: string) {
  return packages
    .filter((p) => p.status === 'submitted')
    .sort((a, b) => {
      const mineA = a.responsibleManagerId === managerId ? 0 : 1
      const mineB = b.responsibleManagerId === managerId ? 0 : 1
      if (mineA !== mineB) return mineA - mineB
      return (a.latest?.submittedAt ?? '').localeCompare(b.latest?.submittedAt ?? '')
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
export function editorWorkload(people: Person[], packages: PackageSummary[], now: Date): EditorWorkload[] {
  return editors(people)
    .map((editor) => {
      const mine = packages.filter((p) => p.editorId === editor.id && isActive(p))
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

/** `decisions` is every review decision of the last 30 days (one row each). */
export function managerLoad(people: Person[], packages: PackageSummary[], decisions: Array<{ decidedById: string }>, now: Date): ManagerLoad[] {
  return managers(people)
    .map((manager) => {
      const mine = packages.filter((p) => p.responsibleManagerId === manager.id && isActive(p))
      return {
        manager,
        responsible: mine.length,
        awaitingReview: mine.filter((p) => p.status === 'submitted').length,
        overdue: mine.filter((p) => isOverdue(p, now)).length,
        decisions: decisions.filter((d) => d.decidedById === manager.id).length,
      }
    })
    .sort((a, b) => b.awaitingReview - a.awaitingReview || a.manager.name.localeCompare(b.manager.name))
}

/** Account access: approved and active, waiting for a role, or deactivated. */
export type Access = 'active' | 'pending' | 'deactivated'
export const accessOf = (a: Pick<StaffAccount, 'role' | 'isActive'>): Access => (a.isActive ? 'active' : a.role ? 'deactivated' : 'pending')

/** Why an account can't switch roles right now, or null. The database repeats this check. */
export function roleChangeBlocker(packages: PackageSummary[], account: StaffAccount): string | null {
  if (!account.role || account.role === 'admin') return null
  const open = packages.filter(
    (p) => !FINISHED_STATUSES.includes(p.status) && (account.role === 'editor' ? p.editorId : p.responsibleManagerId) === account.id,
  ).length
  const count = `${open} open ${open === 1 ? 'package' : 'packages'}`
  if (open > 0 && account.role === 'editor') return `Reassign ${account.name}’s ${count} to another editor first.`
  if (open > 0) return `Make another manager responsible for ${account.name}’s ${count} first.`
  return null
}

// ── Attendance ──────────────────────────────────────────────────────────────

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

export const withinDays = (iso: string | null, days: number, now: Date) =>
  Boolean(iso) && now.getTime() - new Date(iso!).getTime() <= days * DAY_MS
