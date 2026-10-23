// "Back" that returns to the page that opened this one (with its filters), not a fixed page.
// The opener passes `backState(...)` as router state on its link; the opened page reads it
// with `useBack(fallback)`. Without it (a shared link, a new tab) the fallback applies.
import type { MouseEvent } from 'react'
import { useLocation, useNavigate, type Location } from 'react-router'

export interface BackTarget {
  /** Path and query string, e.g. "/packages?status=active". */
  to: string
  /** The page's name, e.g. "Packages". */
  label: string
}

/** Router state for a link, so the page it opens can come back to this one. */
export const backState = (here: Pick<Location, 'pathname' | 'search'>, label: string) => ({
  back: { to: here.pathname + here.search, label } satisfies BackTarget,
})

function openerOf(state: unknown): BackTarget | null {
  const back = (state as { back?: Partial<BackTarget> } | null)?.back
  return typeof back?.to === 'string' && back.to.startsWith('/') && typeof back.label === 'string' ? (back as BackTarget) : null
}

/**
 * Where Back and Cancel go. When this tab came from the opener, they step back in history,
 * which restores it exactly (filters, scroll) and doesn't leave the form behind as a later
 * Back stop; `onClick` does that for links, `go()` after a save.
 */
export function useBack(fallback: BackTarget) {
  const location = useLocation()
  const navigate = useNavigate()
  const opener = openerOf(location.state)
  const historyBack = opener !== null && location.key !== 'default'
  const target = opener ?? fallback

  return {
    ...target,
    go: () => void (historyBack ? navigate(-1) : navigate(target.to)),
    /** For a <Link to={back.to}>: plain clicks step back; Ctrl/⌘-click still opens a new tab. */
    onClick: (event: MouseEvent) => {
      if (!historyBack || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      void navigate(-1)
    },
  }
}
