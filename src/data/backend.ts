// The contract every data backend fulfils. The UI only sees this, through
// `appStore`/`api` in ./store and the hooks in ./hooks, so swapping the
// localStorage demo for Supabase didn't change any page.
import type { ActionResult, AppState, AssignableRole, PackageInput, SubmissionInput, WorkPackage } from './types'

export interface StoreStatus {
  phase: 'idle' | 'loading' | 'ready' | 'error'
  /** Shown with a retry button when phase is 'error'. */
  error?: string
}

/**
 * Commands the UI can run. `actorId` is the signed-in person; the Supabase
 * backend ignores it and lets the database read the user from the session.
 */
export interface Api {
  createPackage(actorId: string, input: PackageInput): Promise<ActionResult<WorkPackage>>
  updatePackage(actorId: string, packageId: string, input: PackageInput): Promise<ActionResult<WorkPackage>>
  startWork(actorId: string, packageId: string): Promise<ActionResult<unknown>>
  submitForReview(actorId: string, packageId: string, input: SubmissionInput): Promise<ActionResult<unknown>>
  requestFeedback(actorId: string, packageId: string, note: string): Promise<ActionResult<unknown>>
  approve(actorId: string, packageId: string): Promise<ActionResult<unknown>>
  clockIn(personId: string): Promise<ActionResult<unknown>>
  clockOut(personId: string): Promise<ActionResult<unknown>>
  markNotificationRead(personId: string, notificationId: string): Promise<ActionResult<unknown>>
  markAllNotificationsRead(personId: string): Promise<ActionResult<unknown>>
  /** Applies the 16-hour auto-close; called periodically while the app is open. */
  sweepAttendance(): Promise<void>
  // Admin staff access. Each change is recorded in the account history under the admin.
  approveAccount(actorId: string, profileId: string, role: AssignableRole): Promise<ActionResult<unknown>>
  changeStaffRole(actorId: string, profileId: string, role: AssignableRole): Promise<ActionResult<unknown>>
  deactivateAccount(actorId: string, profileId: string): Promise<ActionResult<unknown>>
  reactivateAccount(actorId: string, profileId: string): Promise<ActionResult<unknown>>
}

export interface Backend {
  getState(): AppState | null
  getStatus(): StoreStatus
  /** Called on every state or status change. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void
  /** Load data and start live updates (after sign-in). */
  start(): void
  /** Clear data and stop live updates (on sign-out). */
  stop(): void
  /** Fetch everything again, e.g. from a "Try again" button. */
  reload(): Promise<void>
  api: Api
}
