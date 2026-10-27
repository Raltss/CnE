import { ChevronRight, Pause, RotateCcw, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { EditorWorkload } from '../../data/selectors'
import { cx } from '../../lib/styles'

/**
 * Editors and their active packages. One segment per package: overdue first in the playhead color,
 * then those needing changes, then the rest in ink; on-hold ones as outlines after. The counts are
 * also written out in words.
 */
export function WorkloadList({
  workload,
  onSelect,
  to,
  wide,
}: {
  workload: EditorWorkload[]
  /** Full page width: three columns on wide screens. */
  wide?: boolean
  /** Opens a dialog for the editor… */
  onSelect?: (editorId: string) => void
  /** …or links to a page instead. */
  to?: (editorId: string) => string
}) {
  return (
    <ul className={cx('grid gap-px bg-border md:grid-cols-2', wide && 'xl:grid-cols-3')}>
      {workload.map((w) => (
        <li key={w.editor.id} className="bg-surface">
          <Row to={to?.(w.editor.id)} onClick={() => onSelect?.(w.editor.id)}>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate text-ui font-medium">{w.editor.name}</span>
                {w.active > 0 && (
                  <span className="shrink-0 text-sm text-muted-fg">
                    <span className="font-medium text-fg tabular-nums">{w.active}</span> active
                  </span>
                )}
              </span>
              {w.active + w.onHold > 0 ? (
                <span aria-hidden className="mt-2.5 flex h-4 gap-0.75">
                  {Array.from({ length: Math.min(w.active, 16) }, (_, i) => (
                    <span
                      key={i}
                      className={cx(
                        'w-3 rounded-xs',
                        i < w.overdue ? 'bg-now' : i < w.overdue + w.needsChanges ? 'bg-st-feedback/25 ring-1 ring-st-feedback ring-inset' : 'bg-fg/60',
                      )}
                    />
                  ))}
                  {Array.from({ length: Math.min(w.onHold, 4) }, (_, i) => (
                    <span key={`h${i}`} className="w-3 rounded-xs ring-1 ring-border-strong ring-inset" />
                  ))}
                </span>
              ) : (
                <span className="mt-1 block text-sm text-muted-fg">No active packages</span>
              )}
              {(w.overdue > 0 || w.needsChanges > 0 || w.onHold > 0) && (
                <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  {w.overdue > 0 && (
                    <span className="inline-flex items-center gap-1 font-medium text-now">
                      <TriangleAlert aria-hidden className="size-3.5" />
                      {w.overdue} overdue
                    </span>
                  )}
                  {w.needsChanges > 0 && (
                    <span className="inline-flex items-center gap-1 text-st-feedback">
                      <RotateCcw aria-hidden className="size-3.5" />
                      {w.needsChanges} {w.needsChanges === 1 ? 'needs' : 'need'} changes
                    </span>
                  )}
                  {w.onHold > 0 && (
                    <span className="inline-flex items-center gap-1 text-muted-fg">
                      <Pause aria-hidden className="size-3.5" />
                      {w.onHold} on hold
                    </span>
                  )}
                </span>
              )}
            </span>
            <ChevronRight aria-hidden className="mt-1 size-4 shrink-0 self-start text-muted-fg transition-transform duration-120 group-hover:translate-x-0.5" />
          </Row>
        </li>
      ))}
      {/* Fill the last row so no empty cell shows the hairline color. */}
      {Array.from({ length: Math.max((2 - (workload.length % 2)) % 2, wide ? (3 - (workload.length % 3)) % 3 : 0) }, (_, i) => (
        <li
          key={`fill-${i}`}
          aria-hidden
          className={cx(
            'hidden bg-surface',
            i < (2 - (workload.length % 2)) % 2 ? 'md:block' : 'md:hidden',
            wide && (i < (3 - (workload.length % 3)) % 3 ? 'xl:block' : 'xl:hidden'),
          )}
        />
      ))}
    </ul>
  )
}

const rowClasses = 'group flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors duration-120 hover:bg-surface-2/60'

function Row({ to, onClick, children }: { to?: string; onClick: () => void; children: ReactNode }) {
  return to ? (
    <Link to={to} className={rowClasses}>
      {children}
    </Link>
  ) : (
    <button type="button" aria-haspopup="dialog" onClick={onClick} className={rowClasses}>
      {children}
    </button>
  )
}
