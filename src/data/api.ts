// Changing data. Every change runs a checked database function (supabase.rpc) or,
// for Add user, the create-staff-account Edge Function. On success it refreshes
// only the cached lists the change can affect; lists not on screen are just
// marked stale and reload the next time they're shown.
import type { InfiniteData, QueryKey } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { markOwnChange } from './live'
import { friendlyError, keys } from './queries'
import { queryClient } from './queryClient'
import type {
  ActionResult,
  AppNotification,
  AssignableRole,
  PackageInput,
  PackageSummary,
  Page,
  Person,
  Product,
  StaffAccount,
  StaffAccountInput,
  SubmissionInput,
} from './types'
import { isHttpUrl, validatePackageInput, validateProductName, validateStaffAccountInput, validateSubmissionInput } from './validation'

const fail = (error: string, fieldErrors?: Record<string, string>): ActionResult<never> => ({ ok: false, error, fieldErrors })

function client() {
  if (!supabase) throw new Error('Supabase isn’t configured.')
  return supabase
}

const refresh = (...queryKeys: QueryKey[]) => Promise.all(queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })))

/** Changes on their way to the server, by function and arguments. */
const inFlight = new Map<string, Promise<ActionResult<unknown>>>()

/**
 * Run a database function; on success refresh the given lists (and wait for those on screen).
 * The same change requested again while the first is still running (a double click, a
 * second button for the same action) waits for the first instead of sending it twice.
 */
function call<T>(fn: string, args: Record<string, unknown> | undefined, affects: QueryKey[]): Promise<ActionResult<T>> {
  const id = `${fn}:${JSON.stringify(args ?? {})}`
  const running = inFlight.get(id)
  if (running) return running as Promise<ActionResult<T>>
  const run = (async (): Promise<ActionResult<T>> => {
    markOwnChange()
    const { data, error } = await client().rpc(fn, args)
    if (error) {
      // A refusal such as "already approved" or "already clocked in" usually means this
      // screen is out of date (another person or tab acted first), so refresh it too.
      void refresh(...affects)
      return fail(friendlyError(error))
    }
    await refresh(...affects)
    return { ok: true, value: data as T }
  })().finally(() => inFlight.delete(id))
  inFlight.set(id, run)
  return run
}

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

const cached = <T>(key: QueryKey) => queryClient.getQueryData<T>(key)

function packageArgs(input: PackageInput) {
  return {
    p_title: input.title,
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

type EditedPackage = Pick<PackageSummary, 'id' | 'status' | 'editorId' | 'deadline'>

/** Same field checks as the database, so forms can show errors under each field before sending. */
function packageFieldErrors(input: PackageInput, previous?: EditedPackage) {
  const people = cached<Person[]>(keys.people)
  const products = cached<Product[]>(keys.products)
  if (!people || !products) return null
  const errors = validatePackageInput({ people, products }, input, { now: new Date(), previousDeadline: previous?.deadline, previous })
  return Object.keys(errors).length ? fail('Fix the highlighted fields.', errors as Record<string, string>) : null
}

/** Mark notifications read in every cached list, and lower the unread count, without refetching. */
function markReadInCache(personId: string, ids: 'all' | string[]) {
  const now = new Date().toISOString()
  let changed = 0
  queryClient.setQueriesData<InfiniteData<Page<AppNotification>>>({ queryKey: ['notifications', 'list', personId] }, (data) =>
    data && {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        rows: page.rows.map((n) => {
          if (n.readAt || (ids !== 'all' && !ids.includes(n.id))) return n
          changed += 1
          return { ...n, readAt: now }
        }),
      })),
    },
  )
  if (ids === 'all') queryClient.setQueryData<number>(keys.unreadCount(personId), 0)
  else if (changed > 0) queryClient.setQueryData<number>(keys.unreadCount(personId), (count) => Math.max(0, (count ?? 0) - ids.length))
  // Not in any loaded list (e.g. opened from elsewhere): ask the server for the count.
  else void queryClient.invalidateQueries({ queryKey: keys.unreadCount(personId) })
}

/** Everything a status change can move: current work, the package, finished lists, rounds, recent decisions, reports. */
const lifecycleKeys = (packageId: string): QueryKey[] => [keys.activeWork, keys.package(packageId), ['finished'], ['rounds'], ['recent'], ['report']]

const NOTE_TOO_LONG = 'Keep the note under 500 characters.'

/** Same 500-character limit as the database, checked before sending. */
function withNote<T>(note: string, send: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  return note.trim().length > 500 ? Promise.resolve(fail(NOTE_TOO_LONG, { note: NOTE_TOO_LONG })) : send()
}

export const api = {
  // ── Packages ──
  async createPackage(input: PackageInput): Promise<ActionResult<{ id: string; code: string }>> {
    const invalid = packageFieldErrors(input)
    if (invalid) return invalid
    const result = await call<string>('create_package', packageArgs(input), [keys.activeWork])
    if (!result.ok) return result
    const code = cached<Array<{ id: string; code: string }>>(keys.activeWork)?.find((p) => p.id === result.value)?.code ?? 'Package'
    return { ok: true, value: { id: result.value, code } }
  },
  async updatePackage(previous: EditedPackage, input: PackageInput): Promise<ActionResult<{ id: string }>> {
    const invalid = packageFieldErrors(input, previous)
    if (invalid) return invalid
    const result = await call<string>('update_package', { p_package_id: previous.id, ...packageArgs(input) }, [
      keys.activeWork,
      keys.package(previous.id),
      ['finished'],
    ])
    return result.ok ? { ok: true, value: { id: previous.id } } : result
  },
  /** `includedRevisions`: client revisions included with the product, or null for no limit. */
  async createProduct(name: string, includedRevisions: number | null = null): Promise<ActionResult<Product>> {
    const problem = validateProductName(cached<Product[]>(keys.products) ?? [], name)
    if (problem) return fail(problem, { name: problem })
    const result = await call<string>('create_product', { p_name: name.trim(), p_included_revisions: includedRevisions }, [keys.products])
    if (!result.ok) return { ...result, fieldErrors: { name: result.error } }
    return { ok: true, value: { id: result.value, name: name.trim(), includedRevisions } }
  },
  async updateProduct(productId: string, name: string, includedRevisions: number | null): Promise<ActionResult<Product>> {
    const problem = validateProductName(cached<Product[]>(keys.products) ?? [], name, productId)
    if (problem) return fail(problem, { name: problem })
    // Package pages show the allowance, and reports count against it.
    const result = await call('update_product', { p_product_id: productId, p_name: name.trim(), p_included_revisions: includedRevisions }, [
      keys.products,
      ['report'],
    ])
    if (!result.ok) return { ...result, fieldErrors: { name: result.error } }
    return { ok: true, value: { id: productId, name: name.trim(), includedRevisions } }
  },
  startWork: (packageId: string) => call('start_work', { p_package_id: packageId }, [keys.activeWork, keys.package(packageId)]),
  async submitForReview(packageId: string, input: SubmissionInput) {
    const errors = validateSubmissionInput(input)
    if (Object.keys(errors).length) return fail(errors.form ?? 'Fix the highlighted links.', errors as Record<string, string>)
    return call<number>('submit_for_review', { p_package_id: packageId, p_review_link: input.reviewLink, p_delivery_link: input.deliveryLink }, [
      keys.activeWork,
      keys.package(packageId),
      ['rounds'],
    ])
  },
  async requestFeedback(packageId: string, note: string) {
    if (note.trim().length > 500) return fail(NOTE_TOO_LONG, { note: NOTE_TOO_LONG })
    return call('request_feedback', { p_package_id: packageId, p_note: note }, [keys.activeWork, keys.package(packageId), ['rounds'], ['recent']])
  },
  /** Approve and complete without client review. */
  approve: (packageId: string) => call('approve_package', { p_package_id: packageId }, lifecycleKeys(packageId)),

  // ── Client review (managers record the client's decision; clients don't sign in) ──
  sendToClient: (packageId: string) => call('send_to_client', { p_package_id: packageId }, lifecycleKeys(packageId)),
  recordClientApproval: (packageId: string) => call('record_client_approval', { p_package_id: packageId }, lifecycleKeys(packageId)),
  recordClientFeedback: (packageId: string, note: string) =>
    withNote(note, () => call('record_client_feedback', { p_package_id: packageId, p_note: note }, lifecycleKeys(packageId))),
  /** Editors: the final delivery link for a round that has none yet. */
  async addDeliveryLink(packageId: string, link: string): Promise<ActionResult<unknown>> {
    if (!isHttpUrl(link.trim())) return fail('Enter a full link starting with https://', { link: 'Enter a full link starting with https://' })
    return call('add_delivery_link', { p_package_id: packageId, p_delivery_link: link.trim() }, [keys.activeWork, keys.package(packageId), ['rounds']])
  },

  // ── Package lifecycle (managers): PRD §5. Reasons and notes are optional. ──
  holdPackage: (packageId: string, reason: string) => withNote(reason, () => call('hold_package', { p_package_id: packageId, p_reason: reason }, lifecycleKeys(packageId))),
  resumePackage: (packageId: string) => call('resume_package', { p_package_id: packageId }, lifecycleKeys(packageId)),
  cancelPackage: (packageId: string, reason: string) =>
    withNote(reason, () => call('cancel_package', { p_package_id: packageId, p_reason: reason }, lifecycleKeys(packageId))),
  archivePackage: (packageId: string) => call('archive_package', { p_package_id: packageId }, lifecycleKeys(packageId)),
  unarchivePackage: (packageId: string) => call('unarchive_package', { p_package_id: packageId }, lifecycleKeys(packageId)),
  reopenPackage: (packageId: string, note: string) => withNote(note, () => call('reopen_package', { p_package_id: packageId, p_note: note }, lifecycleKeys(packageId))),
  /** Only for a package nobody has started; anything else is cancelled instead. */
  async deletePackage(packageId: string): Promise<ActionResult<unknown>> {
    const result = await call('delete_package', { p_package_id: packageId }, [keys.activeWork, ['finished']])
    if (result.ok) queryClient.removeQueries({ queryKey: keys.package(packageId) })
    return result
  },

  // ── Attendance ──
  clockIn: () => call('clock_in', undefined, [['attendance']]),
  clockOut: () => call('clock_out', undefined, [['attendance']]),
  /** Applies the 16-hour auto-close; called once a minute while the app is open. */
  async sweepAttendance() {
    const { data } = await client().rpc('close_stale_sessions')
    if (typeof data === 'number' && data > 0) await refresh(['attendance'])
  },

  // ── Notifications ──
  async markNotificationRead(personId: string, notificationId: string): Promise<ActionResult<unknown>> {
    const { error } = await client().rpc('mark_notification_read', { p_notification_id: notificationId })
    if (error) return fail(friendlyError(error))
    markReadInCache(personId, [notificationId])
    return { ok: true, value: null }
  },
  async markAllNotificationsRead(personId: string): Promise<ActionResult<unknown>> {
    const { error } = await client().rpc('mark_all_notifications_read')
    if (error) return fail(friendlyError(error))
    markReadInCache(personId, 'all')
    return { ok: true, value: null }
  },

  // ── Staff access (admins). Each change is recorded in the account history under the admin. ──
  approveAccount: (profileId: string, role: AssignableRole) =>
    call('approve_account', { p_profile_id: profileId, p_role: role }, [keys.accounts, keys.people, keys.staffActivity]),
  changeStaffRole: (profileId: string, role: AssignableRole) =>
    call('change_staff_role', { p_profile_id: profileId, p_role: role }, [keys.accounts, keys.people, keys.staffActivity]),
  deactivateAccount: (profileId: string) => call('deactivate_account', { p_profile_id: profileId }, [keys.accounts, keys.people, keys.staffActivity]),
  reactivateAccount: (profileId: string) => call('reactivate_account', { p_profile_id: profileId }, [keys.accounts, keys.people, keys.staffActivity]),

  /** Creates a sign-in account with a temporary password and the chosen role, through the Edge Function. */
  async createStaffAccount(input: StaffAccountInput): Promise<ActionResult<{ id: string }>> {
    const errors = validateStaffAccountInput(cached<StaffAccount[]>(keys.accounts) ?? [], input)
    if (Object.keys(errors).length) return fail('Fix the highlighted fields.', errors as Record<string, string>)
    const { data, error } = await client().functions.invoke<{ id: string }>('create-staff-account', {
      body: { ...input, fullName: input.fullName.trim(), email: input.email.trim(), title: input.title.trim() },
    })
    if (error) {
      const body = await functionErrorBody(error)
      if (body?.error) return fail(body.error, body.fieldErrors)
      const context = (error as { context?: unknown }).context
      const unreachable = !(context instanceof Response) || context.status === 404
      return fail(
        unreachable
          ? 'Couldn’t reach the Add user function. Check that it’s deployed (docs/supabase-setup.md) and try again.'
          : (body?.message ?? 'Couldn’t add the account. Try again.'),
      )
    }
    await refresh(keys.accounts, keys.people, keys.staffActivity)
    return data?.id ? { ok: true, value: { id: data.id } } : fail('The account may have been added, but the reply was unexpected. Refresh the page.')
  },
}
