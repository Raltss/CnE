import { CircleAlert, Clapperboard, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { ThemeToggle } from '../../components/ui/ThemeToggle'
import { buttonClasses, cardClasses, cx } from '../../lib/styles'

/** Centered card used by sign-in and the screens shown before the app loads. */
export function AuthLayout({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-10">
      <div className={cx(cardClasses, 'w-full max-w-md p-6 sm:p-8')}>
        <div className="mb-6 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary text-on-primary">
              <Clapperboard aria-hidden className="size-5" />
            </span>
            <span className="font-display text-xl">CnE</span>
          </div>
          <ThemeToggle className="-mr-2" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <div className="mt-1 text-sm text-muted-fg">{description}</div>}
        {children && <div className="mt-6">{children}</div>}
      </div>
    </main>
  )
}

/**
 * Just a spinner while the session is restored and the account checked (a reload, or
 * right after signing in). It fades in only if that takes long enough to notice.
 */
export function LoadingScreen() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg">
      <div role="status" className="animate-fade-in-late">
        <LoaderCircle aria-hidden className="size-8 animate-spin text-primary motion-reduce:animate-none" />
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
      <div role={error ? 'alert' : 'status'} className="flex flex-col gap-4">
        <p className="flex items-start gap-2 text-sm">
          <Icon aria-hidden className={cx('mt-0.5 size-4 shrink-0', error ? 'text-danger' : 'animate-spin text-primary motion-reduce:animate-none')} />
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
