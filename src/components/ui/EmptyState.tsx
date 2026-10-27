import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from '../../lib/styles'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
  tone?: 'neutral' | 'error'
  compact?: boolean
}

/** Used for both empty results and error states (tone="error"): what happened, why, and the next step. */
export function EmptyState({ icon: Icon, title, children, action, tone = 'neutral', compact }: EmptyStateProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={cx('flex flex-col items-center text-center', compact ? 'gap-1.5 px-5 py-8' : 'gap-2 px-6 py-16')}
    >
      <span
        className={cx(
          'mb-1 flex items-center justify-center rounded-full',
          compact ? 'size-10' : 'size-12',
          tone === 'error' ? 'bg-danger-bg text-danger' : 'bg-surface-2 text-fg',
        )}
      >
        <Icon aria-hidden className={compact ? 'size-4.5' : 'size-5'} />
      </span>
      <p className="text-base font-semibold text-fg">{title}</p>
      {children && <div className="max-w-md text-ui text-muted-fg">{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
