import { useEffect, useState, useSyncExternalStore } from 'react'
import { appStore } from './store'
import type { AppState } from './types'

/**
 * The data the signed-in person can see. Re-renders on every change. Only use
 * it under <DataGate> (see src/session), which waits until data has loaded.
 */
export function useAppState(): AppState {
  const state = useSyncExternalStore(appStore.subscribe, appStore.getState, appStore.getState)
  if (!state) throw new Error('useAppState() was called before data loaded. Render the page inside <DataGate>.')
  return state
}

/** Loading / ready / error, for loading screens and retry buttons. */
export function useStoreStatus() {
  return useSyncExternalStore(appStore.subscribe, appStore.getStatus, appStore.getStatus)
}

/** Current time, refreshed on an interval, for countdowns and live durations. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}
