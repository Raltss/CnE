import { useEffect, useState, useSyncExternalStore } from 'react'

/** Current time, refreshed on an interval, for countdowns and live durations. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

/** The value, once it has stopped changing for `ms` (e.g. a search box before it queries the server). */
export function useDebouncedValue<T>(value: T, ms = 300) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return settled
}

/** Tailwind's `md` breakpoint: tables at this width and up, stacked cards below. */
const WIDE = '(min-width: 48rem)'

/**
 * Whether the screen is at least tablet width. Lists render only the layout
 * that is visible, instead of rendering both and hiding one with CSS.
 */
export function useIsWide() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(WIDE)
      query.addEventListener('change', onChange)
      return () => query.removeEventListener('change', onChange)
    },
    () => window.matchMedia(WIDE).matches,
  )
}
