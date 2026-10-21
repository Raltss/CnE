import { CalendarClock, TriangleAlert } from 'lucide-react'
import { isActive } from '../../data/selectors'
import type { WorkPackage } from '../../data/types'
import { cx } from '../../lib/styles'
import { DAY_MS, formatDateTime, formatDistance } from '../../lib/time'

/** Deadline with a countdown for active work; flags overdue in text, not just color. */
export function DeadlineBadge({ pkg, now, showDate = true }: { pkg: WorkPackage; now: Date; showDate?: boolean }) {
  const left = new Date(pkg.deadline).getTime() - now.getTime()
  const active = isActive(pkg)
  const overdue = active && left < 0
  const soon = active && left >= 0 && left <= 2 * DAY_MS

  return (
    <span className="inline-flex flex-col leading-tight">
      {showDate && <span className="text-sm tabular-nums text-fg">{formatDateTime(pkg.deadline)}</span>}
      {active && (
        <span
          className={cx(
            'inline-flex items-center gap-1 text-xs font-semibold tabular-nums',
            overdue ? 'text-danger' : soon ? 'text-warning' : 'text-muted-fg',
          )}
        >
          {overdue ? <TriangleAlert aria-hidden className="size-3.5" /> : <CalendarClock aria-hidden className="size-3.5" />}
          {overdue ? `Overdue by ${formatDistance(left)}` : `Due in ${formatDistance(left)}`}
        </span>
      )}
    </span>
  )
}
