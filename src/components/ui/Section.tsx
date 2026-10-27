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
    <section aria-labelledby={`sec-${id}`} className={cx(cardClasses, 'flex min-w-0 flex-col overflow-hidden', className)}>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pt-4 pb-3 md:px-5">
        <div className="min-w-0">
          <h2 id={`sec-${id}`} className="text-base font-semibold tracking-tight">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-ui text-muted-fg">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className={cx('min-w-0 flex-1', !flush && 'px-4 pb-5 md:px-5')}>{children}</div>
    </section>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 md:mb-8">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h1 className="min-w-0 text-3xl font-semibold">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {description && <p className="mt-1 max-w-2xl text-ui text-muted-fg">{description}</p>}
    </div>
  )
}
