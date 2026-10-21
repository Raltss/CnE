// Reading data. Each page asks only for what it shows: one TanStack Query per
// list, with explicit columns and filters. Row Level Security still decides which
// rows come back. Current work is small and is loaded completely (paging past the
// Data API's 1,000-row cap), so totals never come from a partial list. Long
// histories (finished packages, rounds, notifications, account changes) are paged
// with a stable order and an exact total.
import { keepPreviousData, queryOptions, useInfiniteQuery, useQuery, type InfiniteData } from '@tanstack/react-query'
import { useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { queryClient } from './queryClient'
import { FINISHED_STATUSES, makeLookup, type FinishedFilters } from './selectors'
import type {
  ActivityEvent,
  AppNotification,
  AttendanceSession,
  Page,
  PackageDetail,
  PackageSummary,
  Person,
  Product,
  RoundSummary,
  RoundWithPackage,
  StaffAccount,
  StaffActivity,
  Submission,
  SubmissionOutcome,
  WorkPackage,
} from './types'

/** The Data API returns at most this many rows per request (`max_rows`, Supabase's default). */
const MAX_ROWS = 1000
/** Rows per page in paged lists. */
export const PAGE_SIZE = 25

// ── Query keys: what each cache entry holds, and what to refresh after a change ──
export const keys = {
  people: ['people'] as const,
  accounts: ['accounts'] as const,
  products: ['products'] as const,
  activeWork: ['active-work'] as const,
  package: (id: string) => ['package', id] as const,
  finished: (filters: FinishedFilters) => ['finished', filters] as const,
  rounds: (filters: RoundFilters) => ['rounds', filters] as const,
  recentDecisions: ['recent', 'decisions'] as const,
  recentCompletions: ['recent', 'completions'] as const,
  myAttendance: (personId: string) => ['attendance', 'person', personId, 31] as const,
  personAttendance: (personId: string, days: number) => ['attendance', 'person', personId, days] as const,
  teamAttendance: (days: number) => ['attendance', 'team', days] as const,
  openSessions: ['attendance', 'open'] as const,
  notifications: (personId: string, unreadOnly: boolean) => ['notifications', 'list', personId, unreadOnly] as const,
  unreadCount: (personId: string) => ['notifications', 'unread', personId] as const,
  staffActivity: ['staff-activity'] as const,
}

// ── Plumbing ────────────────────────────────────────────────────────────────

function client() {
  if (!supabase) throw new Error('Supabase isn’t configured.')
  return supabase
}

/** Turn a Supabase/PostgREST error into a sentence for a page or toast. */
export function friendlyError(error: { message: string; code?: string }): string {
  if (/failed to fetch|network/i.test(error.message)) return 'Couldn’t reach the server. Check your connection and try again.'
  if (error.code === 'PGRST301' || /jwt/i.test(error.message)) return 'Your session has expired. Sign in again.'
  return error.message
}

type Result<T> = { data: T | null; error: { message: string; code?: string } | null; count?: number | null }

function unwrap<T>({ data, error }: Result<T>): T {
  if (error) throw new Error(friendlyError(error))
  return data as T
}

/** Fetches every matching row, 1,000 at a time. The query must have a stable order. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<Result<T[]>>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += MAX_ROWS) {
    const batch = unwrap(await page(from, from + MAX_ROWS - 1)) ?? []
    rows.push(...batch)
    if (batch.length < MAX_ROWS) return rows
  }
}

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
const iso = (value: string) => new Date(value).toISOString()
const isoOrNull = (value: string | null) => (value ? iso(value) : null)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── Row shapes and mapping (snake_case in the database, camelCase in the app) ──

const PERSON_COLUMNS = 'id, full_name, title, role, is_active'
const ACCOUNT_COLUMNS = 'id, email, full_name, title, role, is_active, created_at, must_change_password'
const PACKAGE_COLUMNS = 'id, code, title, product_id, editor_id, responsible_manager_id, deadline, status, created_by, updated_at, completed_at'
const DETAIL_COLUMNS = `${PACKAGE_COLUMNS}, description, brief_link, reference_links, deliverables, created_at`
const ROUND_COLUMNS = 'id, package_id, round, review_link, delivery_link, submitted_at, submitted_by, outcome, decided_at, decided_by, feedback_note'
const LATEST_ROUND = 'latest:submissions(round, submitted_at, review_link, delivery_link, outcome, decided_by, feedback_note)'
const SESSION_COLUMNS = 'id, person_id, clock_in, clock_out, auto_closed'

interface ProfileRow {
  id: string
  email?: string
  full_name: string
  title: string
  role: Person['role'] | null
  is_active: boolean
  created_at?: string
  must_change_password?: boolean
}
interface LatestRow {
  round: number
  submitted_at: string
  review_link: string | null
  delivery_link: string | null
  outcome: SubmissionOutcome
  decided_by: string | null
  feedback_note: string | null
}
interface PackageRow {
  id: string
  code: string
  title: string
  product_id: string
  editor_id: string
  responsible_manager_id: string
  deadline: string
  status: PackageSummary['status']
  created_by: string
  updated_at: string
  completed_at: string | null
  latest?: LatestRow[]
  description?: string
  brief_link?: string
  reference_links?: string[]
  deliverables?: string
  created_at?: string
}
interface SubmissionRow {
  id: string
  package_id: string
  round: number
  review_link: string | null
  delivery_link: string | null
  submitted_at: string
  submitted_by: string
  outcome: SubmissionOutcome
  decided_at: string | null
  decided_by: string | null
  feedback_note: string | null
}
interface SessionRow {
  id: string
  person_id: string
  clock_in: string
  clock_out: string | null
  auto_closed: boolean
}

const toPerson = (p: ProfileRow): Person => ({ id: p.id, name: p.full_name, title: p.title, role: p.role!, isActive: p.is_active })

const toAccount = (p: ProfileRow): StaffAccount => ({
  id: p.id,
  name: p.full_name,
  email: p.email ?? '',
  title: p.title,
  role: p.role,
  isActive: p.is_active,
  createdAt: iso(p.created_at!),
  mustChangePassword: Boolean(p.must_change_password),
})

function toLatest(row: LatestRow | undefined): RoundSummary | null {
  if (!row) return null
  return {
    round: row.round,
    submittedAt: iso(row.submitted_at),
    reviewLink: row.review_link,
    deliveryLink: row.delivery_link,
    outcome: row.outcome,
    decidedById: row.decided_by,
    feedbackNote: row.feedback_note,
  }
}

const toSummary = (p: PackageRow): PackageSummary => ({
  id: p.id,
  code: p.code,
  title: p.title,
  productId: p.product_id,
  editorId: p.editor_id,
  responsibleManagerId: p.responsible_manager_id,
  deadline: iso(p.deadline),
  status: p.status,
  createdById: p.created_by,
  updatedAt: iso(p.updated_at),
  completedAt: isoOrNull(p.completed_at),
  latest: toLatest(p.latest?.[0]),
})

const toSubmission = (s: SubmissionRow): Submission => ({
  id: s.id,
  packageId: s.package_id,
  round: s.round,
  reviewLink: s.review_link,
  deliveryLink: s.delivery_link,
  submittedAt: iso(s.submitted_at),
  submittedById: s.submitted_by,
  outcome: s.outcome,
  decidedAt: isoOrNull(s.decided_at),
  decidedById: s.decided_by,
  feedbackNote: s.feedback_note,
})

const toSession = (s: SessionRow): AttendanceSession => ({
  id: s.id,
  personId: s.person_id,
  clockIn: iso(s.clock_in),
  clockOut: isoOrNull(s.clock_out),
  autoClosed: s.auto_closed,
})

const toStaffActivity = (a: Record<string, never>): StaffActivity => ({
  id: a.id,
  profileId: a.profile_id,
  actorId: a.actor_id,
  type: a.type,
  oldRole: a.old_role,
  newRole: a.new_role,
  oldIsActive: a.old_is_active,
  newIsActive: a.new_is_active,
  message: a.message,
  at: iso(a.at),
})

// ── Directory: people and products (small, shared by most pages) ───────────

const peopleQuery = queryOptions({
  queryKey: keys.people,
  staleTime: 5 * 60_000,
  queryFn: async ({ signal }) =>
    (
      await fetchAll<ProfileRow>((from, to) =>
        client().from('profiles').select(PERSON_COLUMNS).not('role', 'is', null).order('full_name').order('id').range(from, to).abortSignal(signal),
      )
    ).map(toPerson),
})

const productsQuery = queryOptions({
  queryKey: keys.products,
  staleTime: 5 * 60_000,
  queryFn: async ({ signal }): Promise<Product[]> =>
    fetchAll<Product>((from, to) => client().from('products').select('id, name').order('name').order('id').range(from, to).abortSignal(signal)),
})

export const usePeople = () => useQuery(peopleQuery)
export const useProducts = () => useQuery(productsQuery)

/** People and products together, with a name lookup. */
export function useDirectory() {
  const people = usePeople()
  const products = useProducts()
  const lookup = useMemo(() => makeLookup(people.data ?? [], products.data ?? []), [people.data, products.data])
  return { people: people.data ?? [], products: products.data ?? [], lookup, queries: [people, products] as const }
}

/** Admin: every sign-in account, including ones waiting for approval. */
export function useAccounts(enabled = true) {
  return useQuery({
    queryKey: keys.accounts,
    enabled,
    queryFn: async ({ signal }) =>
      (
        await fetchAll<ProfileRow>((from, to) =>
          client().from('profiles').select(ACCOUNT_COLUMNS).order('full_name').order('id').range(from, to).abortSignal(signal),
        )
      ).map(toAccount),
  })
}

// ── Packages ────────────────────────────────────────────────────────────────

const activeWorkQuery = queryOptions({
  queryKey: keys.activeWork,
  queryFn: async ({ signal }) =>
    (
      await fetchAll<PackageRow>((from, to) =>
        client()
          .from('packages')
          .select(`${PACKAGE_COLUMNS}, ${LATEST_ROUND}`)
          .not('status', 'in', `(${FINISHED_STATUSES.join(',')})`)
          .order('deadline')
          .order('id')
          .order('round', { referencedTable: 'latest', ascending: false })
          .limit(1, { referencedTable: 'latest' })
          .range(from, to)
          .abortSignal(signal),
      )
    ).map(toSummary),
})

/** Every package that isn't finished, with its latest round. Small by nature, loaded completely. */
export function useActiveWork<T = PackageSummary[]>(options: { select?: (rows: PackageSummary[]) => T; enabled?: boolean } = {}) {
  return useQuery({ ...activeWorkQuery, enabled: options.enabled, select: options.select })
}

/**
 * A session was found: drop anything cached for a previous person, then start
 * the reads almost every first screen needs (names, products, current work)
 * while the profile is still being checked.
 */
export function startSession() {
  queryClient.clear()
  void queryClient.prefetchQuery(peopleQuery)
  void queryClient.prefetchQuery(productsQuery)
  void queryClient.prefetchQuery(activeWorkQuery)
}

/** One package with every round and its activity history, or null if it doesn't exist or isn't visible. */
export function usePackage(id: string | undefined) {
  return useQuery({
    queryKey: keys.package(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }): Promise<PackageDetail | null> => {
      if (!id || !UUID.test(id)) return null
      const row = unwrap(
        await client()
          .from('packages')
          .select(`${DETAIL_COLUMNS}, ${LATEST_ROUND}, rounds:submissions(${ROUND_COLUMNS}), activity(id, package_id, type, actor_id, at, message)`)
          .eq('id', id)
          .order('round', { referencedTable: 'latest', ascending: false })
          .limit(1, { referencedTable: 'latest' })
          .order('round', { referencedTable: 'rounds', ascending: false })
          .order('at', { referencedTable: 'activity', ascending: false })
          .abortSignal(signal)
          .maybeSingle<PackageRow & { rounds: SubmissionRow[]; activity: Array<Record<string, string>> }>(),
      )
      if (!row) return null
      const pkg: WorkPackage = {
        ...toSummary(row),
        description: row.description ?? '',
        briefLink: row.brief_link ?? '',
        referenceLinks: row.reference_links ?? [],
        deliverables: row.deliverables ?? '',
        createdAt: iso(row.created_at!),
      }
      return {
        pkg,
        rounds: row.rounds.map(toSubmission),
        activity: row.activity.map(
          (a): ActivityEvent => ({ id: a.id, packageId: a.package_id, type: a.type as ActivityEvent['type'], actorId: a.actor_id, at: iso(a.at), message: a.message }),
        ),
      }
    },
  })
}

/** Characters that would change the meaning of a PostgREST `or=(…)` filter. */
const searchText = (q: string) => q.replace(/[,()"*\\%]/g, ' ').trim()

/** Finished packages, newest first, a page at a time, with the total that match. */
export function useFinishedPackages(filters: FinishedFilters, enabled = true) {
  return useInfiniteQuery({
    queryKey: keys.finished(filters),
    enabled,
    placeholderData: keepPreviousData,
    initialPageParam: 0,
    getNextPageParam: nextOffset<PackageSummary>,
    queryFn: async ({ pageParam, signal }): Promise<Page<PackageSummary>> => {
      let query = client().from('packages').select(`${PACKAGE_COLUMNS}, ${LATEST_ROUND}`, { count: 'exact' })
      query = filters.status ? query.eq('status', filters.status) : query.in('status', FINISHED_STATUSES)
      if (filters.product) query = query.eq('product_id', filters.product)
      if (filters.editor) query = query.eq('editor_id', filters.editor)
      if (filters.manager) query = query.eq('responsible_manager_id', filters.manager)
      if (filters.createdBy) query = query.eq('created_by', filters.createdBy)
      const q = searchText(filters.q ?? '')
      if (q) query = query.or(`title.ilike.*${q}*,code.ilike.*${q}*`)
      const result = await query
        .order('completed_at', { ascending: false, nullsFirst: false })
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })
        .order('round', { referencedTable: 'latest', ascending: false })
        .limit(1, { referencedTable: 'latest' })
        .range(pageParam, pageParam + PAGE_SIZE - 1)
        .abortSignal(signal)
      return { rows: (unwrap(result) ?? []).map(toSummary), total: result.count ?? 0 }
    },
  })
}

/** Offset of the next page, or undefined when every matching row is loaded. */
function nextOffset<T>(last: Page<T>, pages: Array<Page<T>>) {
  const loaded = pages.reduce((sum, page) => sum + page.rows.length, 0)
  return loaded < last.total && last.rows.length > 0 ? loaded : undefined
}

/** All rows of a paged list, without duplicates if rows shifted between pages. */
export function pagedRows<T extends { id: string }>(data: InfiniteData<Page<T>> | undefined): T[] {
  const seen = new Set<string>()
  return (data?.pages ?? []).flatMap((page) => page.rows).filter((row) => !seen.has(row.id) && seen.add(row.id))
}
export const pagedTotal = (data: InfiniteData<Page<unknown>> | undefined) => data?.pages[0]?.total ?? 0

// ── Rounds across packages (admin person pages) ─────────────────────────────

export interface RoundFilters {
  personId: string
  /** The person submitted the rounds (editor) or decided them (manager). */
  as: 'submitter' | 'decider'
  outcome?: SubmissionOutcome
  days?: number
}

export function useRounds(filters: RoundFilters) {
  return useInfiniteQuery({
    queryKey: keys.rounds(filters),
    placeholderData: keepPreviousData,
    initialPageParam: 0,
    getNextPageParam: nextOffset<RoundWithPackage>,
    queryFn: async ({ pageParam, signal }): Promise<Page<RoundWithPackage>> => {
      const dateColumn = filters.as === 'submitter' ? 'submitted_at' : 'decided_at'
      let query = client()
        .from('submissions')
        .select(`${ROUND_COLUMNS}, package:packages(id, title, code)`, { count: 'exact' })
        .eq(filters.as === 'submitter' ? 'submitted_by' : 'decided_by', filters.personId)
      if (filters.outcome) query = query.eq('outcome', filters.outcome)
      if (filters.days) query = query.gte(dateColumn, daysAgo(filters.days))
      const result = await query
        .order(dateColumn, { ascending: false })
        .order('id', { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1)
        .abortSignal(signal)
      // The package is a single row (many-to-one), not a list.
      const rows = (unwrap(result) ?? []) as unknown as Array<SubmissionRow & { package: RoundWithPackage['package'] }>
      return { rows: rows.map((r) => ({ ...toSubmission(r), package: r.package })), total: result.count ?? 0 }
    },
  })
}

/** Every review decision of the last 30 days (who decided), for manager totals. */
export function useRecentDecisions() {
  return useQuery({
    queryKey: keys.recentDecisions,
    queryFn: async ({ signal }) =>
      (
        await fetchAll<{ id: string; decided_by: string }>((from, to) =>
          client()
            .from('submissions')
            .select('id, decided_by')
            .gte('decided_at', daysAgo(30))
            .order('decided_at')
            .order('id')
            .range(from, to)
            .abortSignal(signal),
        )
      ).map((d) => ({ decidedById: d.decided_by })),
  })
}

/** Every package completed in the last 30 days (whose it was), for editor totals. */
export function useRecentCompletions() {
  return useQuery({
    queryKey: keys.recentCompletions,
    queryFn: async ({ signal }) =>
      (
        await fetchAll<{ id: string; editor_id: string }>((from, to) =>
          client()
            .from('packages')
            .select('id, editor_id')
            .eq('status', 'completed')
            .gte('completed_at', daysAgo(30))
            .order('completed_at')
            .order('id')
            .range(from, to)
            .abortSignal(signal),
        )
      ).map((p) => ({ editorId: p.editor_id })),
  })
}

// ── Attendance ──────────────────────────────────────────────────────────────

function sessionsQuery(personId: string | null, days: number, signal: AbortSignal) {
  return fetchAll<SessionRow>((from, to) => {
    let query = client().from('attendance_sessions').select(SESSION_COLUMNS).gte('clock_in', daysAgo(days))
    if (personId) query = query.eq('person_id', personId)
    return query.order('clock_in', { ascending: false }).order('id').range(from, to).abortSignal(signal)
  }).then((rows) => rows.map(toSession))
}

/** One person's sessions over the last `days` days (31 covers every personal view). */
export function usePersonAttendance(personId: string, days = 31) {
  return useQuery({
    queryKey: days === 31 ? keys.myAttendance(personId) : keys.personAttendance(personId, days),
    queryFn: ({ signal }) => sessionsQuery(personId, days, signal),
  })
}

/** Everyone's sessions over the last `days` days (managers and admins). */
export function useTeamAttendance(days: number) {
  return useQuery({ queryKey: keys.teamAttendance(days), placeholderData: keepPreviousData, queryFn: ({ signal }) => sessionsQuery(null, days, signal) })
}

/** Who is clocked in right now (managers and admins see everyone; RLS limits others to themselves). */
export function useOpenSessions() {
  return useQuery({
    queryKey: keys.openSessions,
    queryFn: async ({ signal }) =>
      (
        await fetchAll<SessionRow>((from, to) =>
          client().from('attendance_sessions').select(SESSION_COLUMNS).is('clock_out', null).order('clock_in').order('id').range(from, to).abortSignal(signal),
        )
      ).map(toSession),
  })
}

// ── Notifications ───────────────────────────────────────────────────────────

const NOTIFICATION_PAGE = 30

export function useNotifications(personId: string, unreadOnly: boolean) {
  return useInfiniteQuery({
    queryKey: keys.notifications(personId, unreadOnly),
    placeholderData: keepPreviousData,
    initialPageParam: 0,
    getNextPageParam: nextOffset<AppNotification>,
    queryFn: async ({ pageParam, signal }): Promise<Page<AppNotification>> => {
      let query = client()
        .from('notifications')
        .select('id, recipient_id, type, package_id, actor_id, message, created_at, read_at', { count: 'exact' })
        .eq('recipient_id', personId)
      if (unreadOnly) query = query.is('read_at', null)
      const result = await query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(pageParam, pageParam + NOTIFICATION_PAGE - 1)
        .abortSignal(signal)
      const rows = (unwrap(result) ?? []) as Array<Record<string, string | null>>
      return {
        total: result.count ?? 0,
        rows: rows.map((n) => ({
          id: n.id!,
          recipientId: n.recipient_id!,
          type: n.type as AppNotification['type'],
          packageId: n.package_id!,
          actorId: n.actor_id!,
          message: n.message!,
          createdAt: iso(n.created_at!),
          readAt: isoOrNull(n.read_at),
        })),
      }
    },
  })
}

/** The unread count for the bell and nav badge: a count only, no rows. */
export function useUnreadCount(personId: string, enabled = true) {
  return useQuery({
    queryKey: keys.unreadCount(personId),
    enabled,
    queryFn: async ({ signal }) => {
      const result = await client()
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', personId)
        .is('read_at', null)
        .abortSignal(signal)
      unwrap(result)
      return result.count ?? 0
    },
  })
}

// ── Account history (admins) ────────────────────────────────────────────────

const HISTORY_PAGE = 20

export function useStaffActivity() {
  return useInfiniteQuery({
    queryKey: keys.staffActivity,
    initialPageParam: 0,
    getNextPageParam: nextOffset<StaffActivity>,
    queryFn: async ({ pageParam, signal }): Promise<Page<StaffActivity>> => {
      const result = await client()
        .from('staff_activity')
        .select('id, profile_id, actor_id, type, old_role, new_role, old_is_active, new_is_active, message, at', { count: 'exact' })
        .order('at', { ascending: false })
        .order('id', { ascending: false })
        .range(pageParam, pageParam + HISTORY_PAGE - 1)
        .abortSignal(signal)
      const rows = (unwrap(result) ?? []) as unknown as Array<Record<string, never>>
      return { total: result.count ?? 0, rows: rows.map(toStaffActivity) }
    },
  })
}

/** The latest few changes to one account (shown in its Manage access dialog). */
export function useAccountHistory(profileId: string | null, limit = 3) {
  return useQuery({
    queryKey: [...keys.staffActivity, profileId, limit],
    enabled: Boolean(profileId),
    queryFn: async ({ signal }): Promise<StaffActivity[]> => {
      const rows = unwrap(
        await client()
          .from('staff_activity')
          .select('id, profile_id, actor_id, type, old_role, new_role, old_is_active, new_is_active, message, at')
          .eq('profile_id', profileId!)
          .order('at', { ascending: false })
          .order('id', { ascending: false })
          .limit(limit)
          .abortSignal(signal),
      ) as unknown as Array<Record<string, never>>
      return rows.map(toStaffActivity)
    },
  })
}

// ── Page status ─────────────────────────────────────────────────────────────

interface QueryLike {
  isPending: boolean
  error: Error | null
  refetch: () => unknown
}

/** Combined loading/error state of the queries a page needs before it can render. */
export function pageStatus(...queries: QueryLike[]) {
  const failed = queries.filter((q) => q.error)
  return {
    pending: queries.some((q) => q.isPending),
    error: failed[0]?.error?.message ?? null,
    retry: () => failed.forEach((q) => q.refetch()),
  }
}
