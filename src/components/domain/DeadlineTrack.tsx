// The signature view: packages as clips on one Manila-time axis, with the playhead at now.
// Each row's bar is its runway (now → deadline) or, once late, its overrun in playhead red;
// the deadline is the out-point and the latest round sits where it was submitted.
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useIsWide } from '../../data/hooks'
import { isActive, type Lookup } from '../../data/selectors'
import type { PackageSummary } from '../../data/types'
import { cx } from '../../lib/styles'
import { addDays, DAY_MS, formatClock, formatDayKey, formatDue, manilaDateKey, manilaDayStart } from '../../lib/time'
import { DeadlineBadge, DueCountdown } from './DeadlineBadge'
import { trackPercent } from '../../lib/track'
import { Playhead } from './Track'

/** Days shown before today, and the total width of the axis in days. */
const DAYS_BEFORE = 2
const DAYS = 7

interface DeadlineTrackProps {
  packages: PackageSummary[]
  now: Date
  lookup: Lookup
  /** Accessible name of the list. */
  label: string
  /** The row's one action; defaults to a link to the package. */
  action?: (pkg: PackageSummary) => ReactNode
  /** Second line under the title; defaults to code · round · editor. */
  meta?: (pkg: PackageSummary) => ReactNode
  /** A short tag after the title, e.g. "Yours". */
  tag?: (pkg: PackageSummary) => ReactNode
  hideEditor?: boolean
  linkState?: unknown
}

function axis(now: Date) {
  const today = manilaDateKey(now.toISOString())
  const first = addDays(today, -DAYS_BEFORE)
  const start = new Date(manilaDayStart(first)).getTime()
  const end = start + DAYS * DAY_MS
  const days = Array.from({ length: DAYS }, (_, i) => {
    const key = addDays(first, i)
    return { key, at: start + i * DAY_MS, label: key === today ? 'Today' : formatDayKey(key).replace(/,.*$/, '') + ' ' + Number(key.slice(8)), today: key === today }
  })
  return { start, end, days }
}

/** Grid columns shared by the header, every row and the playhead overlay. */
const COLUMNS = 'grid grid-cols-[minmax(0,25rem)_minmax(0,1fr)_12.5rem_8.5rem]'

export function DeadlineTrack({ packages, now, lookup, label, action, meta, tag, hideEditor, linkState }: DeadlineTrackProps) {
  const wide = useIsWide()
  const { start, end, days } = axis(now)
  const nowAt = trackPercent(now.getTime(), start, end)

  const title = (pkg: PackageSummary) => (
    <span className="flex min-w-0 items-baseline gap-2">
      <Link to={`/packages/${pkg.id}`} state={linkState} className="truncate font-medium text-fg decoration-border-strong underline-offset-4 hover:underline">
        {pkg.title}
      </Link>
      {tag?.(pkg)}
    </span>
  )
  const subline = (pkg: PackageSummary) =>
    meta ? (
      meta(pkg)
    ) : (
      <>
        <span className="font-mono">{pkg.code}</span>
        {pkg.latest && (
          <>
            {' · '}
            <span className="font-mono">R{pkg.latest.round}</span>
          </>
        )}
        {!hideEditor && <> · {lookup.personName(pkg.editorId)}</>}
      </>
    )
  const rowAction = (pkg: PackageSummary) =>
    action ? (
      action(pkg)
    ) : (
      <Link to={`/packages/${pkg.id}`} state={linkState} className="text-sm font-medium text-muted-fg decoration-border-strong underline-offset-4 hover:text-fg hover:underline">
        Open<span className="sr-only"> {pkg.title}</span>
      </Link>
    )

  if (!wide)
    return (
      <ul aria-label={label} data-seenry-hero-visual className="divide-y divide-border">
        {packages.map((pkg) => (
          <li key={pkg.id} className="flex flex-col gap-2 px-4 py-3.5">
            <div className="min-w-0">
              {title(pkg)}
              <p className="mt-0.5 text-sm text-muted-fg">{subline(pkg)}</p>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 text-sm text-muted-fg">
                <DueCountdown pkg={pkg} now={now} />
                <span className="block">{formatDue(pkg.deadline, now)}</span>
              </span>
              <span className="shrink-0">{rowAction(pkg)}</span>
            </div>
          </li>
        ))}
      </ul>
    )

  return (
    <div className="relative" role="table" aria-label={label} data-seenry-signature="deadline-track">
      <div role="row" className={cx(COLUMNS, 'h-10 items-center bg-surface-2 text-sm text-muted-fg')}>
        <span role="columnheader" className="pl-5">
          Package
        </span>
        <div role="columnheader" className="relative h-full">
          <span className="sr-only">Timeline</span>
          {days.map((day) => (
            <span
              key={day.key}
              aria-hidden
              className={cx('absolute top-1/2 -translate-y-1/2 pl-1.5 whitespace-nowrap', day.today && 'font-medium text-fg')}
              style={{ left: `${trackPercent(day.at, start, end)}%` }}
            >
              {day.label}
            </span>
          ))}
        </div>
        <span role="columnheader" className="pl-5">
          Deadline
        </span>
        <span role="columnheader">
          <span className="sr-only">Action</span>
        </span>
      </div>

      <div role="rowgroup">
        {packages.map((pkg) => {
          const due = new Date(pkg.deadline).getTime()
          const dueAt = trackPercent(due, start, end)
          const late = isActive(pkg) && due < now.getTime()
          const running = isActive(pkg)
          const round = pkg.latest
          const roundAt = round ? new Date(round.submittedAt).getTime() : null
          return (
            <div role="row" key={pkg.id} className={cx(COLUMNS, 'min-h-16 items-center border-b border-border transition-colors duration-120 last:border-b-0 hover:bg-surface-2/40')}>
              <div role="cell" className="min-w-0 py-3 pl-5">
                {title(pkg)}
                <p className="mt-0.5 truncate text-ui text-muted-fg">{subline(pkg)}</p>
              </div>

              <div role="cell" className="relative h-full min-h-16">
                <span aria-hidden>
                {days.map((day) => (
                  <span
                    key={day.key}
                    className={cx('absolute inset-y-0 w-px', day.today ? 'bg-border-strong/40' : 'bg-border')}
                    style={{ left: `${trackPercent(day.at, start, end)}%` }}
                  />
                ))}
                <span className="absolute inset-y-0 right-0 w-px bg-border" />
                {running && (
                  <span
                    className={cx('absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full', late ? 'bg-now' : 'bg-fg/45')}
                    style={{ left: `${Math.min(nowAt, dueAt)}%`, width: `${Math.abs(dueAt - nowAt)}%` }}
                  />
                )}
                {due >= start && due <= end && (
                  <span
                    className={cx('absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full', late ? 'bg-now' : running ? 'bg-fg' : 'bg-border-strong')}
                    style={{ left: `${dueAt}%` }}
                  />
                )}
                {due > end && running && <span className="absolute top-1/2 right-0 h-1.5 w-6 -translate-y-1/2 bg-linear-to-r from-transparent to-surface" />}
                {round && roundAt !== null && roundAt >= start && roundAt <= end && (
                  <>
                    {/* Waiting since the round came in: a dashed line from the round to now. */}
                    {(pkg.status === 'submitted' || pkg.status === 'client_review') && (
                      <span
                        className="absolute top-1/2 -translate-y-1/2 border-t border-dashed border-fg/45"
                        style={{ left: `${trackPercent(roundAt, start, end)}%`, width: `${Math.max(0, nowAt - trackPercent(roundAt, start, end))}%` }}
                      />
                    )}
                    <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${trackPercent(roundAt, start, end)}%` }}>
                      <span className="block size-2 rounded-full bg-fg ring-2 ring-surface" />
                    </span>
                  </>
                )}
                </span>
              </div>

              <div role="cell" className="py-3 pl-5">
                <DeadlineBadge pkg={pkg} now={now} />
              </div>
              <div role="cell" className="flex justify-end py-3 pr-5 pl-3">
                {rowAction(pkg)}
              </div>
            </div>
          )
        })}
      </div>

      {/* One playhead across every row, at now. */}
      <div className={cx(COLUMNS, 'pointer-events-none absolute inset-x-0 top-10 bottom-0')}>
        <span />
        <div className="relative">
          {/* The flag sits at the top of the first row, clear of the day labels and the row's bar. */}
          <Playhead percent={nowAt} label={formatClock(now)} labelInside />
        </div>
      </div>
    </div>
  )
}
