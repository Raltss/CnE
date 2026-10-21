import type { ReactNode } from 'react'
import { cardClasses, cx } from '../../lib/styles'

interface SectionProps {
  title: string
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  /** Remove body padding, e.g. for edge-to-edge tables. */
  flush?: boolean
}

export function Section({ title, description, actions, children, className, flush }: SectionProps) {
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return (
    <section aria-labelledby={`sec-${id}`} className={cx(cardClasses, 'flex min-w-0 flex-col', className)}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 id={`sec-${id}`} className="text-base font-semibold">
            {title}
          </h2>
          {description && <p className="text-xs text-muted-fg">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      <div className={cx('min-w-0 flex-1', !flush && 'p-4')}>{children}</div>
    </section>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-fg">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
