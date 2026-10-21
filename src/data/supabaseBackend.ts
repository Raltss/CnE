// Supabase backend. Reads every table the signed-in person may see (Row Level
// Security filters the rows), maps snake_case rows into the AppState shape the
// UI already uses, and runs commands as database functions (supabase.rpc).
// Realtime change events trigger a refetch, so other people's actions show up live.
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { Api, Backend, StoreStatus } from './backend'
import type {
  ActionResult,
  ActivityEvent,
  AppNotification,
  AppState,
  AttendanceSession,
  Client,
  PackageInput,
  Person,
  Product,
  StaffAccount,
  StaffActivity,
  Submission,
  WorkPackage,
} from './types'
import { validatePackageInput, validateStaffAccountInput, validateSubmissionInput } from './validation'

// ── Row shapes (as stored in supabase/migrations) ───────────────────────────

interface ProfileRow {
  id: string
  email: string
  full_name: string
  title: string
  role: Person['role'] | null
  is_active: boolean
  created_at: string
  must_change_password: boolean
}
interface ClientRow {
  id: string
  name: string
  manager_id: string
}
interface ProductRow {
  id: string
  client_id: string
  name: string
  manager_id: string | null
}
interface PackageRow {
  id: string
  code: string
  title: string
  client_id: string
  product_id: string
  description: string
  brief_link: string
  reference_links: string[]
  deliverables: string
  editor_id: string
  responsible_manager_id: string
  deadline: string
  status: WorkPackage['status']
  created_at: string
  created_by: string
  updated_at: string
  completed_at: string | null
}
interface SubmissionRow {
  id: string
  package_id: string
  round: number
  review_link: string | null
  delivery_link: string | null
  submitted_at: string
  submitted_by: string
  outcome: Submission['outcome']
  decided_at: string | null
  decided_by: string | null
  feedback_note: string | null
}
interface ActivityRow {
  id: string
  package_id: string
  type: ActivityEvent['type']
  actor_id: string
  at: string
  message: string
}
interface AttendanceRow {
  id: string
  person_id: string
  clock_in: string
  clock_out: string | null
  auto_closed: boolean
}
interface StaffActivityRow {
  id: string
  profile_id: string
  actor_id: string | null
  type: StaffActivity['type']
  old_role: StaffActivity['oldRole']
  new_role: StaffActivity['newRole']
  old_is_active: boolean | null
  new_is_active: boolean | null
  message: string
  at: string
}
interface NotificationRow {
  id: string
  recipient_id: string
  type: AppNotification['type']
  package_id: string
  actor_id: string
  message: string
  created_at: string
  read_at: string | null
}

// The UI sorts timestamps as strings, so normalise them all to one ISO format.
const iso = (value: string) => new Date(value).toISOString()
const isoOrNull = (value: string | null) => (value ? iso(value) : null)

/** How far back attendance is loaded; the pages show at most 30 days. */
const ATTENDANCE_DAYS = 45
/** Most recent notifications loaded per person. */
const NOTIFICATION_LIMIT = 200
/** Most recent account-history entries (admins only; everyone else gets none). */
const STAFF_ACTIVITY_LIMIT = 500

const LIVE_TABLES = ['packages', 'submissions', 'activity', 'attendance_sessions', 'notifications'] as const

function toState(rows: {
  profiles: ProfileRow[]
  clients: ClientRow[]
  products: ProductRow[]
  packages: PackageRow[]
  submissions: SubmissionRow[]
  activity: ActivityRow[]
  attendance: AttendanceRow[]
  notifications: NotificationRow[]
  staffActivity: StaffActivityRow[]
}): AppState {
  const accounts: StaffAccount[] = rows.profiles.map((p) => ({
    id: p.id,
    name: p.full_name,
    email: p.email,
    title: p.title,
    role: p.role,
    isActive: p.is_active,
    createdAt: iso(p.created_at),
    mustChangePassword: p.must_change_password,
  }))
  return {
    accounts,
    people: accounts.flatMap((a) => (a.role ? [{ id: a.id, name: a.name, role: a.role, title: a.title, isActive: a.isActive }] : [])),
    clients: rows.clients.map<Client>((c) => ({ id: c.id, name: c.name, managerId: c.manager_id })),
    products: rows.products.map<Product>((p) => ({ id: p.id, clientId: p.client_id, name: p.name, managerId: p.manager_id })),
    packages: rows.packages.map<WorkPackage>((p) => ({
      id: p.id,
      code: p.code,
      title: p.title,
      clientId: p.client_id,
      productId: p.product_id,
      description: p.description,
      briefLink: p.brief_link,
      referenceLinks: p.reference_links,
      deliverables: p.deliverables,
      editorId: p.editor_id,
      responsibleManagerId: p.responsible_manager_id,
      deadline: iso(p.deadline),
      status: p.status,
      createdAt: iso(p.created_at),
      createdById: p.created_by,
      updatedAt: iso(p.updated_at),
      completedAt: isoOrNull(p.completed_at),
    })),
    submissions: rows.submissions.map<Submission>((s) => ({
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
    })),
    activity: rows.activity.map<ActivityEvent>((a) => ({
      id: a.id,
      packageId: a.package_id,
      type: a.type,
      actorId: a.actor_id,
      at: iso(a.at),
      message: a.message,
    })),
    attendance: rows.attendance.map<AttendanceSession>((a) => ({
      id: a.id,
      personId: a.person_id,
      clockIn: iso(a.clock_in),
      clockOut: isoOrNull(a.clock_out),
      autoClosed: a.auto_closed,
    })),
    notifications: rows.notifications.map<AppNotification>((n) => ({
      id: n.id,
      recipientId: n.recipient_id,
      type: n.type,
      packageId: n.package_id,
      actorId: n.actor_id,
      message: n.message,
      createdAt: iso(n.created_at),
      readAt: isoOrNull(n.read_at),
    })),
    staffActivity: rows.staffActivity.map<StaffActivity>((a) => ({
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
    })),
  }
}

/** Turn a Supabase/PostgREST error into a sentence for a toast or form. */
function friendlyError(error: { message: string; code?: string }): string {
  if (/failed to fetch|network/i.test(error.message)) return 'Couldn’t reach the server. Check your connection and try again.'
  if (error.code === 'PGRST301' || /jwt/i.test(error.message)) return 'Your session has expired. Sign in again.'
  return error.message
}

const fail = (error: string, fieldErrors?: Record<string, string>): ActionResult<never> => ({ ok: false, error, fieldErrors })

/** The JSON an Edge Function sent with a non-2xx status, if any. */
async function functionErrorBody(error: unknown): Promise<{ error?: string; message?: string; fieldErrors?: Record<string, string> } | null> {
  const context = (error as { context?: unknown }).context
  if (!(context instanceof Response)) return null
  try {
    return await context.clone().json()
  } catch {
    return null
  }
}

function functionUnavailable(error: unknown): boolean {
  const context = (error as { context?: unknown }).context
  return !(context instanceof Response) || context.status === 404
}

export function createSupabaseBackend(supabase: SupabaseClient): Backend {
  const listeners = new Set<() => void>()
  let state: AppState | null = null
  let status: StoreStatus = { phase: 'idle' }
  let channel: RealtimeChannel | null = null
  let refreshTimer: number | undefined
  // Ignore responses from loads that finished after a newer one started (or after sign-out).
  let generation = 0

  const emit = () => listeners.forEach((l) => l())
  const setStatus = (next: StoreStatus) => {
    status = next
    emit()
  }

  async function load(): Promise<void> {
    const mine = ++generation
    if (!state) setStatus({ phase: 'loading' })
    const since = new Date(Date.now() - ATTENDANCE_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const [profiles, clients, products, packages, submissions, activity, attendance, notifications, staffActivity] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name, title, role, is_active, created_at, must_change_password').order('full_name'),
      supabase.from('clients').select('id, name, manager_id').order('name'),
      supabase.from('products').select('id, client_id, name, manager_id').order('name'),
      supabase.from('packages').select('*'),
      supabase.from('submissions').select('*'),
      supabase.from('activity').select('*').order('at', { ascending: false }),
      supabase.from('attendance_sessions').select('*').gte('clock_in', since).order('clock_in', { ascending: false }),
      supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(NOTIFICATION_LIMIT),
      supabase.from('staff_activity').select('*').order('at', { ascending: false }).limit(STAFF_ACTIVITY_LIMIT),
    ])
    if (mine !== generation) return
    const failed = [profiles, clients, products, packages, submissions, activity, attendance, notifications, staffActivity].find(
      (r) => r.error,
    )
    if (failed?.error) {
      // Keep showing the last good data if there is some; otherwise show the error.
      if (!state) setStatus({ phase: 'error', error: friendlyError(failed.error) })
      return
    }
    state = toState({
      profiles: profiles.data as ProfileRow[],
      clients: clients.data as ClientRow[],
      products: products.data as ProductRow[],
      packages: packages.data as PackageRow[],
      submissions: submissions.data as SubmissionRow[],
      activity: activity.data as ActivityRow[],
      attendance: attendance.data as AttendanceRow[],
      notifications: notifications.data as NotificationRow[],
      staffActivity: staffActivity.data as StaffActivityRow[],
    })
    setStatus({ phase: 'ready' })
  }

  /** Many change events arrive together (one command writes several tables). */
  function scheduleRefresh() {
    window.clearTimeout(refreshTimer)
    refreshTimer = window.setTimeout(() => void load(), 250)
  }

  /** Run a database function, then reload so every screen shows the result. */
  async function rpc(fn: string, args?: Record<string, unknown>): Promise<ActionResult<unknown>> {
    const { data, error } = await supabase.rpc(fn, args)
    if (error) return fail(friendlyError(error))
    await load()
    return { ok: true, value: data }
  }

  function packageArgs(input: PackageInput) {
    return {
      p_title: input.title,
      p_client_id: input.clientId,
      p_product_id: input.productId,
      p_description: input.description,
      p_brief_link: input.briefLink,
      p_reference_links: input.referenceLinks,
      p_deliverables: input.deliverables,
      p_editor_id: input.editorId,
      p_responsible_manager_id: input.responsibleManagerId,
      p_deadline: input.deadline,
    }
  }

  /** Same field-level checks as the demo, so forms show errors under each field. */
  function packageFieldErrors(input: PackageInput, previousDeadline?: string) {
    if (!state) return null
    const errors = validatePackageInput(state, input, { now: new Date(), previousDeadline })
    return Object.keys(errors).length ? fail('Fix the highlighted fields.', errors as Record<string, string>) : null
  }

  async function savedPackage(result: ActionResult<unknown>): Promise<ActionResult<WorkPackage>> {
    if (!result.ok) return result
    const pkg = state?.packages.find((p) => p.id === result.value)
    return pkg ? { ok: true, value: pkg } : fail('Saved, but the package couldn’t be loaded. Refresh the page.')
  }

  const api: Api = {
    async createPackage(_actorId, input) {
      return packageFieldErrors(input) ?? savedPackage(await rpc('create_package', packageArgs(input)))
    },
    async updatePackage(_actorId, packageId, input) {
      const previous = state?.packages.find((p) => p.id === packageId)
      return (
        packageFieldErrors(input, previous?.deadline) ??
        savedPackage(await rpc('update_package', { p_package_id: packageId, ...packageArgs(input) }))
      )
    },
    startWork: (_actorId, packageId) => rpc('start_work', { p_package_id: packageId }),
    async submitForReview(_actorId, packageId, input) {
      const errors = validateSubmissionInput(input)
      if (Object.keys(errors).length) return fail(errors.form ?? 'Fix the highlighted links.', errors as Record<string, string>)
      return rpc('submit_for_review', { p_package_id: packageId, p_review_link: input.reviewLink, p_delivery_link: input.deliveryLink })
    },
    async requestFeedback(_actorId, packageId, note) {
      if (note.trim().length > 500) return fail('Keep the note under 500 characters.', { note: 'Keep the note under 500 characters.' })
      return rpc('request_feedback', { p_package_id: packageId, p_note: note })
    },
    approve: (_actorId, packageId) => rpc('approve_package', { p_package_id: packageId }),
    clockIn: () => rpc('clock_in'),
    clockOut: () => rpc('clock_out'),
    markNotificationRead: (_personId, notificationId) => rpc('mark_notification_read', { p_notification_id: notificationId }),
    markAllNotificationsRead: () => rpc('mark_all_notifications_read'),
    async sweepAttendance() {
      const { data } = await supabase.rpc('close_stale_sessions')
      if (typeof data === 'number' && data > 0) await load()
    },
    approveAccount: (_actorId, profileId, role) => rpc('approve_account', { p_profile_id: profileId, p_role: role }),
    changeStaffRole: (_actorId, profileId, role) => rpc('change_staff_role', { p_profile_id: profileId, p_role: role }),
    deactivateAccount: (_actorId, profileId) => rpc('deactivate_account', { p_profile_id: profileId }),
    reactivateAccount: (_actorId, profileId) => rpc('reactivate_account', { p_profile_id: profileId }),
    async createStaffAccount(_actorId, input) {
      if (state) {
        const errors = validateStaffAccountInput(state, input)
        if (Object.keys(errors).length) return fail('Fix the highlighted fields.', errors as Record<string, string>)
      }
      const { data, error } = await supabase.functions.invoke<{ id: string }>('create-staff-account', {
        body: { ...input, fullName: input.fullName.trim(), email: input.email.trim(), title: input.title.trim() },
      })
      if (error) {
        const body = await functionErrorBody(error)
        if (body?.error) return fail(body.error, body.fieldErrors)
        return fail(
          functionUnavailable(error)
            ? 'Couldn’t reach the Add user function. Check that it’s deployed (docs/supabase-setup.md) and try again.'
            : (body?.message ?? 'Couldn’t add the account. Try again.'),
        )
      }
      await load()
      return data?.id ? { ok: true, value: { id: data.id } } : fail('The account may have been added, but the reply was unexpected. Refresh the page.')
    },
  }

  return {
    getState: () => state,
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start() {
      if (channel) return
      void load()
      channel = LIVE_TABLES.reduce(
        (ch, table) => ch.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefresh),
        supabase.channel('cne-live-data'),
      ).subscribe()
    },
    stop() {
      generation += 1
      window.clearTimeout(refreshTimer)
      if (channel) void supabase.removeChannel(channel)
      channel = null
      state = null
      setStatus({ phase: 'idle' })
    },
    reload: load,
    api,
  }
}
