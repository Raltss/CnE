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
    <nav aria-label={label} className="mb-5 flex gap-4 overflow-x-auto border-b border-border">
      {tabs.map((tab) => {
        const active = tab.id === current
        return (
          <Link
            key={tab.id}
            to={`?${param}=${tab.id}`}
            aria-current={active ? 'page' : undefined}
            className={cx(
              '-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-0.5 text-ui font-medium whitespace-nowrap transition-colors duration-180',
              active ? 'border-fg text-fg' : 'border-transparent text-muted-fg hover:border-border-strong/50 hover:text-fg',
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={cx('text-sm tabular-nums', active ? 'text-fg' : 'text-muted-fg')}>
                {tab.count}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
