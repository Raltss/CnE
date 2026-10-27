import { ChevronRight, TriangleAlert, type LucideIcon } from 'lucide-react'
import { Children, type ReactNode } from 'react'
import { Link } from 'react-router'
import { cx } from '../../lib/styles'

interface KpiStatProps {
  label: string
  /** A count; drives the late color when above zero. */
  value?: number
  /** Preformatted value shown instead of `value`, e.g. a duration. */
  display?: string
  /** Kept for callers; figures carry no decorative icon. */
  icon?: LucideIcon
  /** One short supporting line under the value. */
  hint?: ReactNode
  to?: string
  /** Opens a drill-down (e.g. a dialog) instead of navigating. */
  onClick?: () => void
  tone?: 'neutral' | 'attention' | 'danger'
}

/** One figure in a FigureStrip: label, the number at display size, one line of context. */
export function KpiStat({ label, value = 0, display, hint, to, onClick, tone = 'neutral' }: KpiStatProps) {
  const late = tone === 'danger' && value > 0
  const interactive = Boolean(onClick || to)
  const body = (
    <>
      <span className="flex items-center justify-between gap-2 text-sm font-medium text-muted-fg">
        <span className="flex items-center gap-1.5">
          {late && <TriangleAlert aria-hidden className="size-3.5 text-now" />}
          {label}
        </span>
        {interactive && <ChevronRight aria-hidden className="size-4 opacity-0 transition-opacity duration-120 group-hover:opacity-100" />}
      </span>
      <span className={cx('mt-2 text-3xl leading-none font-semibold tracking-tight tabular-nums', late ? 'text-now' : tone === 'attention' && value > 0 ? 'text-fg' : 'text-fg')}>
        {display ?? value}
      </span>
      {hint && <span className="mt-2 text-sm text-muted-fg">{hint}</span>}
    </>
  )
  const className = cx('group flex min-w-0 flex-col items-stretch bg-surface px-5 py-4 text-left', interactive && 'transition-colors duration-120 hover:bg-surface-2')
  if (onClick)
    return (
      <button type="button" onClick={onClick} aria-haspopup="dialog" className={className}>
        {body}
      </button>
    )
  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}

// Full class names so Tailwind generates them.
const COLS: Record<number, string> = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5' }

/**
 * Summary figures in one divided strip (hairlines between cells at any wrap). Two per row on
 * phones; with an odd count the last figure takes the full row, so no empty cell shows.
 */
export function KpiStrip({ children, className }: { children: ReactNode; className?: string }) {
  const count = Children.toArray(children).filter(Boolean).length
  return (
    <div
      className={cx(
        'mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border',
        COLS[count] ?? 'lg:grid-cols-4',
        count % 2 === 1 && 'max-lg:[&>:last-child]:col-span-2',
        className,
      )}
    >
      {children}
    </div>
  )
}
