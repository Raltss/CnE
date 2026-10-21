import { Link } from 'react-router'
import { cx } from '../../lib/styles'

export interface TabItem {
  id: string
  label: string
  count?: number
}

interface TabNavProps {
  tabs: TabItem[]
  current: string
  /** Accessible name, e.g. "Bea Lim’s work". */
  label: string
  /** Query-string key that holds the tab, so every tab has its own URL. */
  param?: string
}

/** Page-level tabs as links (`?tab=…`). Switching tabs clears that tab's filters. */
export function TabNav({ tabs, current, label, param = 'tab' }: TabNavProps) {
  return (
    <nav aria-label={label} className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab) => {
        const active = tab.id === current
        return (
          <Link
            key={tab.id}
            to={`?${param}=${tab.id}`}
            aria-current={active ? 'page' : undefined}
            className={cx(
              '-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold whitespace-nowrap transition-colors duration-150',
              active ? 'border-primary text-primary' : 'border-transparent text-muted-fg hover:text-fg',
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={cx('rounded-full px-1.5 text-xs leading-5 tabular-nums', active ? 'bg-primary/10' : 'bg-surface-2')}>
                {tab.count}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
