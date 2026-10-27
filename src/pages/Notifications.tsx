import { CheckCheck } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { NotificationList } from '../components/domain/NotificationList'
import { LoadMore, PageStatus } from '../components/ui/PageStatus'
import { PageHeader, Section } from '../components/ui/Section'
import { useToast } from '../components/ui/toast-context'
import { api } from '../data/api'
import { pagedRows, pagedTotal, useNotifications, useUnreadCount } from '../data/queries'
import { buttonClasses, cx } from '../lib/styles'
import { useSession } from '../session/context'

export function Notifications() {
  const { me } = useSession()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const filter = params.get('show') === 'unread' ? 'unread' : 'all'
  // Newest first, 30 at a time; the unread count is a separate count-only query.
  const list = useNotifications(me.id, filter === 'unread')
  const unread = useUnreadCount(me.id).data ?? 0
  // Marked read in this view: keep them out of the Unread tab without refetching.
  const items = pagedRows(list.data).filter((n) => filter === 'all' || !n.readAt)
  const total = pagedTotal(list.data)

  const markAll = async () => {
    const r = await api.markAllNotificationsRead(me.id)
    toast.show(r.ok ? 'All notifications marked as read' : r.error, r.ok ? 'success' : 'error')
  }

  const tab = (value: 'all' | 'unread', label: string, count?: number) => (
    <button
      type="button"
      aria-pressed={filter === value}
      onClick={() => setParams(value === 'all' ? {} : { show: value }, { replace: true })}
      className={cx(
        'min-h-9 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-180 ease-out',
        filter === value ? 'bg-surface text-fg shadow-xs ring-1 ring-border' : 'text-muted-fg hover:text-fg',
      )}
    >
      {label}
      {count !== undefined && <span className="ml-1.5 font-mono text-muted-fg">{count}</span>}
    </button>
  )

  return (
    <>
      <PageHeader
        title="Notifications"
        description="In-app only for now. Email notifications come later."
        actions={
          <button type="button" className={buttonClasses('secondary')} onClick={markAll} disabled={!unread}>
            <CheckCheck aria-hidden className="size-4" />
            Mark all as read
          </button>
        }
      />
      <Section
        title={unread ? `${unread} unread` : 'All caught up'}
        flush
        actions={
          <div className="flex gap-1 rounded-lg bg-surface-2 p-1" role="group" aria-label="Show notifications">
            {tab('all', 'All', filter === 'all' && !list.isPending ? total : undefined)}
            {tab('unread', 'Unread', unread)}
          </div>
        }
      >
        {list.data === undefined ? (
          <PageStatus error={list.error?.message} retry={() => void list.refetch()} />
        ) : (
          <>
            <NotificationList items={items} personId={me.id} emptyText={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'} />
            <LoadMore
              shown={pagedRows(list.data).length}
              total={total}
              loading={list.isFetchingNextPage}
              onMore={() => void list.fetchNextPage()}
              noun="notifications"
            />
          </>
        )}
      </Section>
    </>
  )
}
