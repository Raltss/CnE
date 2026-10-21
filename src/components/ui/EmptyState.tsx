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

/** Used for both empty results and error states (tone="error"). */
export function EmptyState({ icon: Icon, title, children, action, tone = 'neutral', compact }: EmptyStateProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={cx('flex flex-col items-center text-center', compact ? 'gap-1 px-4 py-6' : 'gap-2 px-6 py-12')}
    >
      <span
        className={cx(
          'flex items-center justify-center rounded-full',
          compact ? 'size-9' : 'size-12',
          tone === 'error' ? 'bg-danger-bg text-danger' : 'bg-surface-2 text-muted-fg',
        )}
      >
        <Icon aria-hidden className={compact ? 'size-4' : 'size-6'} />
      </span>
      <p className="font-semibold text-fg">{title}</p>
      {children && <div className="max-w-md text-sm text-muted-fg">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
