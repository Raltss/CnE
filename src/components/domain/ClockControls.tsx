import { LogIn, LogOut } from 'lucide-react'
import { useNow } from '../../data/hooks'
import { sessionDurationMs } from '../../data/selectors'
import { buttonClasses, cardClasses, cx } from '../../lib/styles'
import { formatClock, formatDate, formatDateTime, formatDuration, formatTime } from '../../lib/time'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { useClock } from './useClock'

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

/** Compact top-bar control: live Manila time, session duration, and the clock action. */
export function ClockPill() {
  const clock = useClock()
  const now = useNow(15_000)
  const { session } = clock

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-sm text-muted-fg tabular-nums sm:inline" aria-label={`Manila time ${formatClock(now)}`}>
        {formatClock(now)} PHT
      </span>
      <button
        type="button"
        onClick={session ? clock.askClockOut : clock.clockIn}
        disabled={clock.busy}
        className={cx(
          'inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm font-semibold transition-colors duration-150',
          session
            ? 'border-success/50 bg-success-bg text-fg hover:border-success'
            : 'border-border-strong bg-surface text-fg hover:bg-surface-2',
        )}
      >
        <span aria-hidden className={cx('size-2 rounded-full', session ? 'bg-success' : 'bg-border-strong')} />
        {session ? (
          <>
            <span className="whitespace-nowrap tabular-nums">
              <span className="sr-only">Clocked in, </span>
              {formatDuration(sessionDurationMs(session, now))}
            </span>
            <span className="hidden text-muted-fg md:inline">· Clock out</span>
            <span className="sr-only md:hidden">Clock out</span>
          </>
        ) : (
          <span>Clock in</span>
        )}
      </button>
      <ClockOutConfirm clock={clock} />
    </div>
  )
}

/** Larger status card for the attendance page and the editor dashboard rail. */
export function ClockCard() {
  const clock = useClock()
  const now = useNow(15_000)
  const { session } = clock
  return (
    <div className={cx(cardClasses, 'flex flex-col gap-3 p-4')}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-fg uppercase">Current status</p>
          <p className="mt-1 flex items-center gap-2 text-lg font-semibold">
            <span aria-hidden className={cx('size-2.5 rounded-full', session ? 'bg-success' : 'bg-border-strong')} />
            {session ? 'Clocked in' : 'Clocked out'}
          </p>
        </div>
        <p className="text-right text-sm text-muted-fg tabular-nums">
          Manila time
          <span className="block text-xl font-semibold text-fg">{formatClock(now)}</span>
        </p>
      </div>
      {session && (
        <p className="text-sm text-muted-fg tabular-nums">
          Since {formatDateTime(session.clockIn)} · <span className="font-semibold text-fg">{formatDuration(sessionDurationMs(session, now))}</span>
        </p>
      )}
      <button
        type="button"
        onClick={session ? clock.askClockOut : clock.clockIn}
        disabled={clock.busy}
        className={buttonClasses(session ? 'secondary' : 'primary', 'md', 'w-full')}
      >
        {session ? <LogOut aria-hidden className="size-4" /> : <LogIn aria-hidden className="size-4" />}
        {session ? 'Clock out' : 'Clock in'}
      </button>
      <p className="text-xs text-muted-fg">
        Closing or refreshing the page keeps you clocked in. Sessions left open for 16 hours close automatically and are flagged.
      </p>
      <ClockOutConfirm clock={clock} />
    </div>
  )
}

/** Full-size clock for the Time Clock page: big Manila time, status, and one clear action. */
export function ClockPanel() {
  const clock = useClock()
  const now = useNow(15_000)
  const { session } = clock
  return (
    <section aria-label="Clock in and out" className={cx(cardClasses, 'flex flex-col items-center gap-5 px-6 py-8 text-center')}>
      <div>
        <p className="text-sm font-medium text-muted-fg">Manila time (PHT)</p>
        <p className="mt-1 text-5xl font-bold tracking-tight tabular-nums">{formatClock(now)}</p>
        <p className="mt-1 text-sm text-muted-fg">{formatDate(now.toISOString())}</p>
      </div>

      <p
        className={cx(
          'inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold',
          session ? 'bg-success-bg text-success' : 'bg-surface-2 text-muted-fg',
        )}
      >
        <span aria-hidden className={cx('size-2 rounded-full', session ? 'bg-success' : 'bg-border-strong')} />
        {session ? `Clocked in since ${formatTime(session.clockIn)}` : 'You’re clocked out'}
      </p>

      {session && (
        <p className="text-muted-fg">
          Session so far
          <span className="block text-3xl font-semibold text-fg tabular-nums">{formatDuration(sessionDurationMs(session, now))}</span>
        </p>
      )}

      <button
        type="button"
        onClick={session ? clock.askClockOut : clock.clockIn}
        disabled={clock.busy}
        className={buttonClasses(session ? 'secondary' : 'primary', 'md', 'min-h-12 w-full max-w-xs text-base')}
      >
        {session ? <LogOut aria-hidden className="size-5" /> : <LogIn aria-hidden className="size-5" />}
        {session ? 'Clock out' : 'Clock in'}
      </button>
      <p className="max-w-sm text-sm text-muted-fg">
        Closing or refreshing the page keeps you clocked in. Sessions left open for 16 hours close automatically and are flagged.
      </p>
      <ClockOutConfirm clock={clock} />
    </section>
  )
}
