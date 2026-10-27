import { CircleAlert, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { BigClock, Playhead } from '../../components/domain/Track'
import { trackPercent } from '../../lib/track'
import { BrandMark } from '../../components/ui/BrandMark'
import { ThemeToggle } from '../../components/ui/ThemeToggle'
import { useNow } from '../../data/hooks'
import { buttonClasses, cx } from '../../lib/styles'
import { formatClock, formatDate, HOUR_MS, manilaDateKey, manilaDayStart } from '../../lib/time'

/** Sign-in and the screens shown before the app loads: the form, and on wide screens the bay with Manila time. */
export function AuthLayout({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,36rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,44rem)]">
      <main className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <BrandMark className="text-fg" />
          <ThemeToggle className="-mr-2" />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="text-3xl font-semibold">{title}</h1>
          {description && <div className="mt-2 text-ui text-muted-fg">{description}</div>}
          {children && <div className="mt-8">{children}</div>}
        </div>
      </main>
      <BayPanel />
    </div>
  )
}

/** Today's working hours as a track, with the playhead at Manila now. Wide screens only. */
function BayPanel() {
  const now = useNow(15_000)
  const dayStart = new Date(manilaDayStart(manilaDateKey(now.toISOString()))).getTime()
  const start = dayStart + 6 * HOUR_MS
  const end = dayStart + 24 * HOUR_MS
  const hours = [6, 9, 12, 15, 18, 21]
  return (
    <aside aria-label="Manila time" className="chrome hidden flex-col justify-between p-10 lg:flex xl:p-14">
      <p className="text-sm text-chrome-muted">The editing team’s workflow</p>
      <div>
        <p className="text-sm text-chrome-fg">{formatDate(now.toISOString())} · Manila</p>
        <p className="mt-2 font-mono text-7xl leading-none font-medium tracking-tight text-chrome-strong xl:text-8xl">
          <BigClock time={formatClock(now)} />
        </p>
        <div className="relative mt-12 h-16">
          {hours.map((h) => (
            <span key={h} aria-hidden className="absolute inset-y-0 w-px bg-chrome-line" style={{ left: `${trackPercent(dayStart + h * HOUR_MS, start, end)}%` }}>
              <span className="absolute top-full mt-2 -translate-x-1/2 text-xs text-chrome-muted">{h % 12 || 12} {h < 12 ? 'AM' : 'PM'}</span>
            </span>
          ))}
          <span aria-hidden className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-chrome-2" />
          <span
            aria-hidden
            className="absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full bg-chrome-fg/40"
            style={{ width: `${trackPercent(now.getTime(), start, end)}%` }}
          />
          <Playhead percent={trackPercent(now.getTime(), start, end)} />
        </div>
      </div>
      <p className="max-w-sm text-lg leading-snug text-chrome-strong">Every cut, its round, and whose turn it is, in Manila time.</p>
    </aside>
  )
}

/**
 * Just a spinner while the session is restored and the account checked (a reload, or
 * right after signing in). It fades in only if that takes long enough to notice.
 */
export function LoadingScreen() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg">
      <div role="status" className="flex animate-fade-in-late flex-col items-center gap-4 text-muted-fg">
        <BrandMark wordmark={false} />
        <LoaderCircle aria-hidden className="size-5 animate-spin motion-reduce:animate-none" />
        <span className="sr-only">Loading</span>
      </div>
    </main>
  )
}

/** Full-page message, or an error with a retry, before the app shell exists. */
export function StatusScreen({
  title,
  message,
  error,
  onRetry,
  onSignOut,
}: {
  title: string
  message?: ReactNode
  error?: boolean
  onRetry?: () => void
  onSignOut?: () => void
}) {
  const Icon = error ? CircleAlert : LoaderCircle
  return (
    <AuthLayout title={title}>
      <div role={error ? 'alert' : 'status'} className="flex flex-col gap-5">
        <p className="flex items-start gap-2 text-ui">
          <Icon aria-hidden className={cx('mt-0.5 size-4 shrink-0', error ? 'text-danger' : 'animate-spin text-muted-fg motion-reduce:animate-none')} />
          <span>{message}</span>
        </p>
        {(onRetry || onSignOut) && (
          <div className="flex flex-col gap-2 sm:flex-row">
            {onRetry && (
              <button type="button" className={buttonClasses('primary')} onClick={onRetry}>
                Try again
              </button>
            )}
            {onSignOut && (
              <button type="button" className={buttonClasses('secondary')} onClick={onSignOut}>
                Sign out
              </button>
            )}
          </div>
        )}
      </div>
    </AuthLayout>
  )
}
