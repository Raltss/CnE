// Local demo backend: one shared state for every demo account, persisted to
// localStorage and synced across tabs. Used only when VITE_USE_DEMO_DATA=true.
// Nothing here runs until createDemoBackend() is called, so the Supabase build
// never seeds or touches localStorage data.
import type { Backend, StoreStatus } from './backend'
import { createSeedState, DEMO_STATE_VERSION } from './seed'
import type { ActionResult, DemoState, WorkPackage } from './types'
import * as wf from './workflow'

const STORAGE_KEY = 'cne.demo.state'
const READY: StoreStatus = { phase: 'ready' }

function readStorage(): DemoState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DemoState
    return parsed.version === DEMO_STATE_VERSION ? parsed : null
  } catch {
    return null
  }
}

function writeStorage(next: DemoState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage full or blocked: the demo keeps working in memory for this tab.
  }
}

export interface DemoBackend extends Backend {
  resetDemoData(): void
}

export function createDemoBackend(): DemoBackend {
  const listeners = new Set<() => void>()
  let state: DemoState = readStorage() ?? createSeedState()
  writeStorage(state)

  const emit = () => listeners.forEach((l) => l())

  function commit(next: DemoState) {
    state = next
    writeStorage(next)
    emit()
  }

  /**
   * Run a command against a fresh copy of the latest persisted state (another
   * tab may have written since we last read), committing only on success.
   */
  function run<T>(command: (draft: DemoState, at: string) => ActionResult<T>): Promise<ActionResult<T>> {
    const draft = structuredClone(readStorage() ?? state)
    const now = new Date()
    wf.autoCloseStaleSessions(draft, now)
    const result = command(draft, now.toISOString())
    if (result.ok) commit(draft)
    return Promise.resolve(result)
  }

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return
    const next = readStorage()
    if (next) {
      state = next
      emit()
    }
  })

  return {
    getState: () => state,
    getStatus: () => READY,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start() {},
    stop() {},
    reload: () => Promise.resolve(),
    api: {
      createPackage: (actorId, input) => run<WorkPackage>((d, at) => wf.createPackage(d, actorId, input, at)),
      updatePackage: (actorId, packageId, input) => run<WorkPackage>((d, at) => wf.updatePackage(d, actorId, packageId, input, at)),
      startWork: (actorId, packageId) => run((d, at) => wf.startWork(d, actorId, packageId, at)),
      submitForReview: (actorId, packageId, input) => run((d, at) => wf.submitForReview(d, actorId, packageId, input, at)),
      requestFeedback: (actorId, packageId, note) => run((d, at) => wf.requestFeedback(d, actorId, packageId, note, at)),
      approve: (actorId, packageId) => run((d, at) => wf.approvePackage(d, actorId, packageId, at)),
      clockIn: (personId) => run((d, at) => wf.clockIn(d, personId, at)),
      clockOut: (personId) => run((d, at) => wf.clockOut(d, personId, at)),
      markNotificationRead: (personId, id) => run((d, at) => wf.markNotificationRead(d, personId, id, at)),
      markAllNotificationsRead: (personId) => run((d, at) => wf.markAllNotificationsRead(d, personId, at)),
      async sweepAttendance() {
        const draft = structuredClone(readStorage() ?? state)
        if (wf.autoCloseStaleSessions(draft, new Date()) > 0) commit(draft)
      },
      approveAccount: (actorId, profileId, role) => run((d, at) => wf.approveAccount(d, actorId, profileId, role, at)),
      changeStaffRole: (actorId, profileId, role) => run((d, at) => wf.changeStaffRole(d, actorId, profileId, role, at)),
      deactivateAccount: (actorId, profileId) => run((d, at) => wf.deactivateAccount(d, actorId, profileId, at)),
      reactivateAccount: (actorId, profileId) => run((d, at) => wf.reactivateAccount(d, actorId, profileId, at)),
    },
    resetDemoData() {
      commit(createSeedState())
    },
  }
}
