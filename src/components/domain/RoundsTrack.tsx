// A package's life on one track: assigned → rounds → out-point (the deadline), with the
// playhead at now. Visual only; the same facts are written out in the slate and the history.
import { isActive } from '../../data/selectors'
import type { Submission, SubmissionOutcome, WorkPackage } from '../../data/types'
import { cx } from '../../lib/styles'
import { formatClock, formatDueInline, formatShortDate } from '../../lib/time'
import { trackPercent } from '../../lib/track'
import { Playhead } from './Track'

const DOT: Record<SubmissionOutcome, string> = {
  pending: 'bg-st-submitted',
  feedback: 'bg-st-feedback',
  client_feedback: 'bg-st-feedback',
  with_client: 'bg-st-client',
  approved: 'bg-st-completed',
}

export function RoundsTrack({ pkg, rounds, now }: { pkg: WorkPackage; rounds: Submission[]; now: Date }) {
  const created = new Date(pkg.createdAt).getTime()
  const due = new Date(pkg.deadline).getTime()
  const done = pkg.completedAt ? new Date(pkg.completedAt).getTime() : null
  const last = Math.max(due, now.getTime(), done ?? 0, ...rounds.map((r) => new Date(r.submittedAt).getTime()))
  const span = Math.max(last - created, 60 * 60 * 1000)
  const start = created - span * 0.03
  const end = last + span * 0.05
  const at = (t: number) => trackPercent(t, start, end)
  const running = isActive(pkg)
  const late = running && due < now.getTime()
  const nowAt = at(now.getTime())
  const dueAt = at(due)
  // Oldest first; a label steps up when its round sits close to the one before.
  const marks = [...rounds]
    .sort((a, b) => a.round - b.round)
    .reduce<Array<{ round: Submission; left: number; lift: number }>>((list, round) => {
      const left = at(new Date(round.submittedAt).getTime())
      const before = list.at(-1)
      return [...list, { round, left, lift: before && left - before.left < 6 ? before.lift + 1 : 0 }]
    }, [])

  return (
    <div aria-hidden className="relative mx-1 mt-8 mb-9 h-3">
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-2 ring-1 ring-border" />
      <div
        className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-fg/25"
        style={{ left: `${at(created)}%`, width: `${Math.max(0, Math.min(done ? at(done) : nowAt, dueAt) - at(created))}%` }}
      />
      {late && <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-now" style={{ left: `${dueAt}%`, width: `${nowAt - dueAt}%` }} />}

      <Marker left={at(created)} className="h-4 w-0.5 bg-border-strong" label={`Assigned ${formatShortDate(pkg.createdAt)}`} align="start" />
      <Marker
        left={dueAt}
        className={cx('h-4 w-0.5', late ? 'bg-now' : 'bg-fg')}
        label={`Due ${formatDueInline(pkg.deadline, now)}`}
        labelClass={late ? 'font-medium text-now' : 'font-medium text-fg'}
        align={dueAt > 80 ? 'end' : 'center'}
      />

      {marks.map(({ round: r, left, lift }) => (
        <span key={r.id} className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: `${left}%` }}>
          <span className={cx('block size-3 rounded-full ring-2 ring-surface', DOT[r.outcome])} />
          <span className="absolute left-1/2 -translate-x-1/2 font-mono text-sm leading-none text-fg" style={{ bottom: `calc(100% + ${6 + lift * 16}px)` }}>
            R{r.round}
          </span>
        </span>
      ))}
      {done && (
        <span className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: `${at(done)}%` }}>
          <span className="block size-3 rotate-45 rounded-xs bg-st-completed ring-2 ring-surface" />
        </span>
      )}
      <Playhead percent={nowAt} label={formatClock(now)} bleed />
    </div>
  )
}

function Marker({
  left,
  className,
  label,
  labelClass,
  align,
}: {
  left: number
  className: string
  label: string
  labelClass?: string
  align: 'start' | 'center' | 'end'
}) {
  return (
    <span className="absolute top-1/2 -translate-y-1/2" style={{ left: `${left}%` }}>
      <span className={cx('block -translate-x-1/2 rounded-full', className)} />
      <span
        className={cx(
          'absolute top-6 text-sm whitespace-nowrap text-muted-fg',
          align === 'start' ? 'left-0' : align === 'end' ? 'right-0' : 'left-0 -translate-x-1/2',
          labelClass,
        )}
      >
        {label}
      </span>
    </span>
  )
}
