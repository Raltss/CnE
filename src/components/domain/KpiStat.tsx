import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cardClasses, cx } from '../../lib/styles'

interface KpiStatProps {
  label: string
  /** A count; drives the attention/danger tint when above zero. */
  value?: number
  /** Preformatted value shown instead of `value`, e.g. a duration. */
  display?: string
  icon: LucideIcon
  /** One short supporting line under the label. */
  hint?: ReactNode
  to?: string
  /** Opens a drill-down (e.g. a dialog) instead of navigating. */
  onClick?: () => void
  tone?: 'neutral' | 'attention' | 'danger'
}

export function KpiStat({ label, value = 0, display, icon: Icon, hint, to, onClick, tone = 'neutral' }: KpiStatProps) {
  const body = (
    <>
      <span
        className={cx(
          'flex size-10 shrink-0 items-center justify-center rounded-md',
          tone === 'danger' && value > 0
            ? 'bg-danger-bg text-danger'
            : tone === 'attention' && value > 0
              ? 'bg-st-feedback-bg text-st-feedback'
              : 'bg-surface-2 text-muted-fg',
        )}
      >
        <Icon aria-hidden className="size-5" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-2xl leading-none font-bold tabular-nums">{display ?? value}</span>
        <span className="mt-1.5 text-sm font-medium text-fg">{label}</span>
        {hint && <span className="mt-0.5 text-xs text-muted-fg">{hint}</span>}
      </span>
    </>
  )
  // Stacked on narrow screens so two tiles fit side by side without cramped labels.
  const className = cx(cardClasses, 'flex flex-col items-start gap-3 p-4 text-left sm:flex-row sm:gap-4')
  const interactive = 'transition-colors duration-150 hover:border-border-strong hover:bg-surface-2'
  if (onClick)
    return (
      <button type="button" onClick={onClick} aria-haspopup="dialog" className={cx(className, interactive, 'w-full')}>
        {body}
      </button>
    )
  return to ? (
    <Link to={to} className={cx(className, interactive)}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}

export function KpiStrip({ children }: { children: ReactNode }) {
  return <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{children}</div>
}
