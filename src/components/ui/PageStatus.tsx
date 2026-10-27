import { CircleAlert, LoaderCircle } from 'lucide-react'
import { buttonClasses } from '../../lib/styles'
import { EmptyState } from './EmptyState'

/** Loading or error placeholder for a page (or a section) whose data hasn't arrived. */
export function PageStatus({ error, retry, label = 'Loading…' }: { error?: string | null; retry?: () => void; label?: string }) {
  if (error)
    return (
      <EmptyState
        icon={CircleAlert}
        title="Couldn’t load this"
        tone="error"
        action={
          retry && (
            <button type="button" className={buttonClasses('primary')} onClick={retry}>
              Try again
            </button>
          )
        }
      >
        {error}
      </EmptyState>
    )
  return (
    <div role="status" className="flex animate-fade-in-late items-center justify-center gap-2 px-4 py-16 text-ui text-muted-fg">
      <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
      {label}
    </div>
  )
}

/** "Show more" for paged lists, with how many are loaded out of the total. */
export function LoadMore({ shown, total, loading, onMore, noun }: { shown: number; total: number; loading: boolean; onMore: () => void; noun: string }) {
  if (total <= shown) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3 text-sm">
      <span className="text-muted-fg tabular-nums">
        Showing {shown} of {total} {noun}
      </span>
      <button type="button" className={buttonClasses('secondary', 'sm')} disabled={loading} onClick={onMore}>
        {loading ? 'Loading…' : 'Show more'}
      </button>
    </div>
  )
}
