import { LogIn, LogOut } from 'lucide-react'
import { useNow } from '../../data/hooks'
import { sessionDurationMs } from '../../data/selectors'
import type { AttendanceSession } from '../../data/types'
import { buttonClasses, cardClasses, cx } from '../../lib/styles'
import { formatClock, formatDate, formatDateTime, formatDuration, formatTime, HOUR_MS } from '../../lib/time'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { trackPercent } from '../../lib/track'
import { BigClock, Playhead } from './Track'
import { useClock } from './useClock'

/** Open sessions close automatically after this long (PRD §6). */
const AUTO_CLOSE_MS = 16 * HOUR_MS

function ClockOutConfirm({ clock }: { clock: ReturnType<typeof useClock> }) {
  return (
    <ConfirmDialog
      open={clock.confirmingOut}
      title="Clock out now?"
      description={
        clock.session ? (
          <>Your session started {formatDateTime(clock.session.clockIn)}. You can clock in again later.</>
        ) : undefined
      }
      confirmLabel="Clock out"
      onConfirm={clock.clockOut}
      onCancel={clock.cancelClockOut}
    />
  )
}

/** Top-bar control (on the bay): a live session counter like a REC light, and the clock action. */
export function ClockPill() {
  const clock = useClock()
  const now = useNow(15_000)
  const { session } = clock

  return (
    <>
      <button
        type="button"
        onClick={session ? clock.askClockOut : clock.clockIn}
        disabled={clock.busy || clock.loading}
        data-seenry-dot={session ? 'presence' : undefined}
        className={cx(
          'mr-1 inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors duration-120 disabled:opacity-60',
          session
            ? 'bg-chrome-2 text-chrome-strong ring-1 ring-chrome-line hover:bg-chrome-3'
            : 'bg-chrome-strong text-chrome hover:bg-chrome-fg',
        )}
      >
        {session ? (
          <>
            <span aria-hidden data-seenry-dot="presence" className="size-2 rounded-full bg-live" />
            <span className="whitespace-nowrap tabular-nums">
              <span className="sr-only">Clocked in, </span>
              {formatDuration(sessionDurationMs(session, now))}
            </span>
            <span className="hidden text-chrome-muted sm:inline">Clock out</span>
            <span className="sr-only sm:hidden">Clock out</span>
          </>
        ) : (
          <>
            <LogIn aria-hidden className="size-4" />
            <span className="whitespace-nowrap">Clock in</span>
          </>
        )}
      </button>
      <ClockOutConfirm clock={clock} />
    </>
  )
}

/**
 * The open session as a clip on its own track: from clock-in to the 16-hour
 * auto-close (its out-point), filled up to now, with the playhead at now.
 */
export function SessionTrack({ session, now }: { session: AttendanceSession; now: Date }) {
  const start = new Date(session.clockIn).getTime()
  const end = start + AUTO_CLOSE_MS
  const at = trackPercent(now.getTime(), start, end)
  return (
    <div>
      <div className="relative mt-7 h-3 rounded-full bg-surface-2">
        <div className="absolute inset-y-0 left-0 rounded-full bg-fg/80" style={{ width: `${at}%` }} />
        <Playhead percent={at} bleed />
      </div>
      <div className="mt-2 flex justify-between text-sm text-muted-fg">
        <span>
          In <span className="text-fg tabular-nums">{formatTime(session.clockIn)}</span>
        </span>
        <span>
          Auto-closes <span className="text-fg tabular-nums">{formatTime(new Date(end).toISOString())}</span>
        </span>
      </div>
    </div>
  )
}

/** Clock status for the editor dashboard rail. */
export function ClockCard() {
  const clock = useClock()
  const now = useNow(15_000)
  const { session } = clock
  return (
    <section aria-labelledby="clock-card" className={cx(cardClasses, 'flex flex-col gap-4 p-5')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="clock-card" className="text-base font-semibold">
            Time clock
          </h2>
          <p className="mt-0.5 text-sm text-muted-fg">
            {session ? (
              <>
                Clocked in · <span className="text-fg tabular-nums">{formatDuration(sessionDurationMs(session, now))}</span>
              </>
            ) : (
              'You’re clocked out'
            )}
          </p>
        </div>
        <p className="text-right font-mono text-2xl leading-none font-medium">
          {formatClock(now)}
          <span className="mt-1 block font-sans text-sm font-normal text-muted-fg">Manila time</span>
        </p>
      </div>
      {session && <SessionTrack session={session} now={now} />}
      <button
        type="button"
        onClick={session ? clock.askClockOut : clock.clockIn}
        disabled={clock.busy || clock.loading}
        className={buttonClasses(session ? 'secondary' : 'primary', 'md', 'w-full')}
      >
        {session ? <LogOut aria-hidden /> : <LogIn aria-hidden />}
        {session ? 'Clock out' : 'Clock in'}
      </button>
      <ClockOutConfirm clock={clock} />
    </section>
  )
}

/** Full-size clock for the Time Clock page: Manila time, the session on its track, one clear action. */
export function ClockPanel() {
  const clock = useClock()
  const now = useNow(15_000)
  const { session } = clock
  return (
    <section aria-label="Clock in and out" className={cx(cardClasses, 'flex flex-col gap-6 p-6')}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-fg">Manila time · {formatDate(now.toISOString())}</p>
          <p className="mt-1 font-mono text-5xl leading-none font-medium tracking-tight">
            <BigClock time={formatClock(now)} />
          </p>
        </div>
        <p className="text-right">
          <span className="block text-sm text-muted-fg">{session ? `Clocked in since ${formatTime(session.clockIn)}` : 'You’re clocked out'}</span>
          {session && <span className="mt-1 block font-mono text-3xl leading-none font-medium">{formatDuration(sessionDurationMs(session, now))}</span>}
        </p>
      </div>

      {session ? (
        <SessionTrack session={session} now={now} />
      ) : (
        <p className="rounded-lg bg-surface-2 px-4 py-3 text-sm text-muted-fg">Clock in when you start working. Your session shows here as it runs.</p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md text-base text-muted-fg">Closing the page keeps you clocked in. Sessions left open for 16 hours close on their own and are flagged.</p>
        <button
          type="button"
          onClick={session ? clock.askClockOut : clock.clockIn}
          disabled={clock.busy || clock.loading}
          className={buttonClasses(session ? 'secondary' : 'primary', 'md', 'min-h-12 shrink-0 px-6 text-base sm:min-w-44')}
        >
          {session ? <LogOut aria-hidden /> : <LogIn aria-hidden />}
          {session ? 'Clock out' : 'Clock in'}
        </button>
      </div>
      <ClockOutConfirm clock={clock} />
    </section>
  )
}
