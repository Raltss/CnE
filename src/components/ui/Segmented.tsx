import { useId } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { inputClasses } from '../../lib/styles'
import { cx } from '../../lib/styles'

export interface SegmentItem {
  id: string
  label: string
  count?: number
  /** Late work: the count takes the playhead color when above zero. */
  late?: boolean
}

interface SegmentedProps {
  items: SegmentItem[]
  current: string
  /** Accessible name, e.g. "Dashboard views". */
  label: string
  /** Query-string key that holds the choice, so every view has its own URL. */
  param: string
}

/** Views of one list: a segmented control of links, or on phones a select (one row, nothing clipped). */
export function Segmented({ items, current, label, param }: SegmentedProps) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const id = useId()
  const href = (id: string) => {
    const next = new URLSearchParams(params)
    next.set(param, id)
    return `?${next.toString()}`
  }
  return (
    <>
    <div className="w-full md:hidden">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select id={id} value={current} onChange={(e) => navigate(href(e.target.value), { replace: true, preventScrollReset: true })} className={inputClasses()}>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
            {item.count !== undefined ? ` (${item.count})` : ''}
          </option>
        ))}
      </select>
    </div>
    <nav aria-label={label} className="hidden flex-wrap gap-1 rounded-lg bg-surface-2 p-1 md:flex">
      {items.map((item) => {
        const active = item.id === current
        return (
          <Link
            key={item.id}
            to={href(item.id)}
            replace
            preventScrollReset
            aria-current={active ? 'page' : undefined}
            className={cx(
              'inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-180 ease-out',
              active ? 'bg-surface text-fg shadow-xs ring-1 ring-border' : 'text-muted-fg hover:text-fg',
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className={cx('tabular-nums', item.late && item.count > 0 ? 'font-medium text-now' : active ? 'text-fg' : 'text-muted-fg')}>{item.count}</span>
            )}
          </Link>
        )
      })}
    </nav>
    </>
  )
}
