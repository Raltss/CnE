import { TriangleAlert } from 'lucide-react'
import { isActive } from '../../data/selectors'
import type { PackageSummary } from '../../data/types'
import { cx } from '../../lib/styles'
import { DAY_MS, formatDistance, formatDue } from '../../lib/time'

/** Time left (or past) for active work, in the data voice: "in 21h 14m", "1d 3h late". */
export function DueCountdown({ pkg, now, className }: { pkg: PackageSummary; now: Date; className?: string }) {
  if (!isActive(pkg)) return null
  const left = new Date(pkg.deadline).getTime() - now.getTime()
  const overdue = left < 0
  // Weight marks the last day; the playhead color marks late.
  const today = !overdue && left <= DAY_MS
  const soon = !overdue && left <= 2 * DAY_MS
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 text-sm whitespace-nowrap tabular-nums',
        overdue ? 'font-medium text-now' : today ? 'font-medium text-fg' : soon ? 'text-fg' : 'text-muted-fg',
        className,
      )}
    >
      {overdue && <TriangleAlert aria-hidden className="size-3.5 shrink-0" />}
      {overdue ? `${formatDistance(left)} late` : `in ${formatDistance(left)}`}
    </span>
  )
}

/** Deadline in Manila time, with the countdown for active work; late is said in words, not only color. */
export function DeadlineBadge({ pkg, now, showDate = true }: { pkg: PackageSummary; now: Date; showDate?: boolean }) {
  return (
    <span className="inline-flex flex-col gap-0.5 leading-tight">
      {showDate && <span className="text-ui whitespace-nowrap text-fg">{formatDue(pkg.deadline, now)}</span>}
      <DueCountdown pkg={pkg} now={now} />
    </span>
  )
}
