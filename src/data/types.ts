// Domain types shared by the data layer and the UI. Shapes mirror the Supabase
// tables in supabase/migrations (camelCase here, snake_case in the database).

/** Admins manage staff access and oversee all work (read-only); managers and editors do the package work. */
export type Role = 'admin' | 'manager' | 'editor'

/** Roles an admin can hand out in the app. Admin access is granted only in the SQL editor. */
export type AssignableRole = 'manager' | 'editor'

/** Approved staff with a role. Inactive people stay so history keeps their names. */
export interface Person {
  id: string
  name: string
  role: Role
  title: string
  isActive: boolean
}

/** Every sign-in account, including ones still waiting for a role (admin view). */
export interface StaffAccount {
  id: string
  name: string
  email: string
  title: string
  role: Role | null
  isActive: boolean
  createdAt: string
  /** Added by an admin with a temporary password they haven't replaced yet. */
  mustChangePassword: boolean
}

export interface Client {
  id: string
  name: string
  managerId: string
}

export interface Product {
  id: string
  clientId: string
  name: string
  /** Null means the product falls back to the client's manager. */
  managerId: string | null
}

/**
 * Full PRD status set. This milestone implements transitions between the
 * five main statuses only; On Hold / Cancelled / Archived are typed for later.
 */
export type PackageStatus =
  | 'assigned'
  | 'in_progress'
  | 'submitted'
  | 'apply_feedback'
  | 'completed'
  | 'on_hold'
  | 'cancelled'
  | 'archived'

export interface WorkPackage {
  id: string
  /** Human-friendly reference shown in tables, e.g. PKG-1042. */
  code: string
  title: string
  clientId: string
  productId: string
  description: string
  briefLink: string
  referenceLinks: string[]
  deliverables: string
  editorId: string
  responsibleManagerId: string
  /** ISO instant; entered and displayed in Asia/Manila. */
  deadline: string
  status: PackageStatus
  createdAt: string
  createdById: string
  updatedAt: string
  completedAt: string | null
}

export type SubmissionOutcome = 'pending' | 'feedback' | 'approved'

/** One record per submission round, even when links are reused. */
export interface Submission {
  id: string
  packageId: string
  round: number
  reviewLink: string | null
  deliveryLink: string | null
  submittedAt: string
  submittedById: string
  outcome: SubmissionOutcome
  decidedAt: string | null
  decidedById: string | null
  /** Optional short note with Apply Feedback; details stay in Frame.io. */
  feedbackNote: string | null
}

export type ActivityType =
  | 'created'
  | 'reassigned'
  | 'started'
  | 'submitted'
  | 'feedback'
  | 'approved'
  | 'deadline_changed'
  | 'manager_changed'
  | 'edited'

export interface ActivityEvent {
  id: string
  packageId: string
  type: ActivityType
  actorId: string
  at: string
  message: string
}

export interface AttendanceSession {
  id: string
  personId: string
  clockIn: string
  clockOut: string | null
  /** Closed automatically after the 16-hour limit; a correction may be needed. */
  autoClosed: boolean
}

export type NotificationType =
  | 'assigned'
  | 'reassigned_away'
  | 'submitted'
  | 'feedback'
  | 'approved'
  | 'deadline_changed'
  | 'manager_changed'

export type StaffChangeType = 'account_created' | 'approved' | 'role_changed' | 'deactivated' | 'reactivated' | 'details_changed'

/** One entry in an account's access history (admins only). */
export interface StaffActivity {
  id: string
  profileId: string
  /** The admin who made the change; null for a trusted setup step (SQL editor, new sign-up). */
  actorId: string | null
  type: StaffChangeType
  oldRole: Role | null
  newRole: Role | null
  oldIsActive: boolean | null
  newIsActive: boolean | null
  message: string
  at: string
}

export interface AppNotification {
  id: string
  recipientId: string
  type: NotificationType
  packageId: string
  actorId: string
  message: string
  createdAt: string
  readAt: string | null
}

/** Everything the signed-in person is allowed to read. */
export interface AppState {
  people: Person[]
  accounts: StaffAccount[]
  clients: Client[]
  products: Product[]
  packages: WorkPackage[]
  submissions: Submission[]
  activity: ActivityEvent[]
  attendance: AttendanceSession[]
  notifications: AppNotification[]
  /** Empty for everyone except admins (RLS). */
  staffActivity: StaffActivity[]
}

/** The localStorage demo keeps a little extra bookkeeping. */
export interface DemoState extends AppState {
  version: number
  seededAt: string
  nextPackageNumber: number
}

export interface PackageInput {
  title: string
  clientId: string
  productId: string
  description: string
  briefLink: string
  referenceLinks: string[]
  deliverables: string
  editorId: string
  responsibleManagerId: string
  /** ISO instant. */
  deadline: string
}

/** What an admin enters in "Add user". The password is temporary: they choose their own at first sign-in. */
export interface StaffAccountInput {
  fullName: string
  email: string
  title: string
  role: AssignableRole
  password: string
}

export interface SubmissionInput {
  reviewLink: string
  deliveryLink: string
}

export type FieldErrors<K extends string = string> = Partial<Record<K, string>>

export type ActionResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }
