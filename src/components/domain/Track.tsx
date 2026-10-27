// The playhead device: time drawn as a track, with now marked by a red line and flag.
// Used wherever a view has time in it (deadline track, rounds, sessions, calendar).
import type { ReactNode } from 'react'
import { cx } from '../../lib/styles'
import { trackPercent } from '../../lib/track'


/**
 * The playhead: a 2px line at `percent` with a flag. The flag can carry a short label
 * (the time). Purely visual; the time it marks is always written out nearby as text.
 */
export function Playhead({
  percent,
  label,
  className,
  flag = true,
  bleed,
  labelInside,
}: {
  percent: number
  label?: ReactNode
  className?: string
  flag?: boolean
  /** Extend 6px past the track above and below. */
  bleed?: boolean
  /** Put the time flag inside the top of the track instead of above it. */
  labelInside?: boolean
}) {
  return (
    <div
      aria-hidden
      className={cx('pointer-events-none absolute z-10 w-0.5 -translate-x-1/2 bg-now transition-[left] duration-180 ease-move', bleed ? '-inset-y-1.5' : 'inset-y-0', className)}
      style={{ left: `${percent}%` }}
    >
      {flag &&
        (label ? (
          <span
            className={cx(
              'absolute left-1/2 -translate-x-1/2 rounded-sm bg-now px-1.5 text-xs leading-5 font-medium whitespace-nowrap text-on-now tabular-nums',
              labelInside ? 'top-1' : '-top-0.5 -translate-y-full',
            )}
          >
            {label}
          </span>
        ) : (
          <span className="absolute -top-1 left-1/2 h-2 w-3 -translate-x-1/2 rounded-xs bg-now" />
        ))}
    </div>
  )
}

/** A display clock: the digits large, AM/PM set smaller beside them ("3:28 PM"). */
export function BigClock({ time, className, suffixClassName }: { time: string; className?: string; suffixClassName?: string }) {
  const [, digits, half] = /^(.*?)\s*([AP]M)?$/i.exec(time) ?? [time, time, '']
  return (
    <span className={className}>
      {digits}
      {half && <span className={cx('ml-[0.15em] align-baseline text-[0.42em] tracking-normal', suffixClassName)}>{half}</span>}
    </span>
  )
}

export interface TrackTick {
  at: number
  label: string
  /** Stronger line, e.g. midnight or today. */
  major?: boolean
}

/** Vertical grid lines with labels under the track. */
export function TrackTicks({ ticks, start, end, labels = true }: { ticks: TrackTick[]; start: number; end: number; labels?: boolean }) {
  return (
    <>
      {ticks.map((tick) => {
        const left = trackPercent(tick.at, start, end)
        return (
          <div key={tick.at} aria-hidden className="pointer-events-none absolute inset-y-0" style={{ left: `${left}%` }}>
            <span className={cx('absolute inset-y-0 w-px', tick.major ? 'bg-border-strong/40' : 'bg-border')} />
            {labels && <span className="absolute top-full mt-1 ml-1.5 text-xs whitespace-nowrap text-muted-fg">{tick.label}</span>}
          </div>
        )
      })}
    </>
  )
}

const RUNWAY_BEFORE = 2 * 24 * 60 * 60 * 1000
const RUNWAY_AFTER = 7 * 24 * 60 * 60 * 1000

/**
 * A small runway for one deadline: the playhead fixed at now, the deadline as the
 * out-point, the gap between them in ink (time left) or playhead red (late).
 * Spans two days back and a week ahead; further deadlines run off the right edge.
 */
export function RunwayTrack({ deadline, now, className }: { deadline: string; now: Date; className?: string }) {
  const start = now.getTime() - RUNWAY_BEFORE
  const end = now.getTime() + RUNWAY_AFTER
  const at = trackPercent(now.getTime(), start, end)
  const due = trackPercent(new Date(deadline).getTime(), start, end)
  const late = due < at
  return (
    <span aria-hidden className={cx('relative inline-block h-4 w-28 shrink-0 align-middle', className)}>
      <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-2 ring-1 ring-border" />
      <span
        className={cx('absolute top-1/2 h-1 min-w-1.5 -translate-y-1/2 rounded-full', late ? 'bg-now' : 'bg-fg/70')}
        style={{ left: `${Math.min(at, due)}%`, width: `${Math.abs(due - at)}%` }}
      />
      {due < 100 && <span className={cx('absolute inset-y-0.5 w-0.5 -translate-x-1/2 rounded-full', late ? 'bg-now' : 'bg-fg')} style={{ left: `${due}%` }} />}
      <span className="absolute inset-y-0.5 w-0.5 -translate-x-1/2 rounded-full bg-now" style={{ left: `${at}%` }} />
    </span>
  )
}
