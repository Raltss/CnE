import { CheckCheck } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { NotificationList } from '../components/domain/NotificationList'
import { PageHeader, Section } from '../components/ui/Section'
import { useToast } from '../components/ui/toast-context'
import { useAppState } from '../data/hooks'
import { notificationsFor } from '../data/selectors'
import { api } from '../data/store'
import { buttonClasses, cx } from '../lib/styles'
import { useSession } from '../session/context'

export function Notifications() {
  const state = useAppState()
  const { me } = useSession()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const filter = params.get('show') === 'unread' ? 'unread' : 'all'
  const all = notificationsFor(state, me.id)
  const unread = all.filter((n) => !n.readAt)
  const items = filter === 'unread' ? unread : all

  const markAll = async () => {
    const r = await api.markAllNotificationsRead(me.id)
    toast.show(r.ok ? 'All notifications marked as read' : r.error, r.ok ? 'success' : 'error')
  }

  const tab = (value: 'all' | 'unread', label: string, count: number) => (
    <button
      type="button"
      aria-pressed={filter === value}
      onClick={() => setParams(value === 'all' ? {} : { show: value }, { replace: true })}
      className={cx(
        'min-h-9 rounded-md px-3 text-sm font-semibold transition-colors duration-150',
        filter === value ? 'bg-primary text-on-primary' : 'text-muted-fg hover:bg-surface-2 hover:text-fg',
      )}
    >
      {label} <span className="tabular-nums">({count})</span>
    </button>
  )

  return (
    <>
      <PageHeader
        title="Notifications"
        description="In-app only for now. Email notifications come later."
        actions={
          <button type="button" className={buttonClasses('secondary')} onClick={markAll} disabled={!unread.length}>
            <CheckCheck aria-hidden className="size-4" />
            Mark all as read
          </button>
        }
      />
      <Section
        title={unread.length ? `${unread.length} unread` : 'All caught up'}
        flush
        actions={
          <div className="flex gap-1" role="group" aria-label="Show notifications">
            {tab('all', 'All', all.length)}
            {tab('unread', 'Unread', unread.length)}
          </div>
        }
      >
        <NotificationList items={items} personId={me.id} emptyText={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'} />
      </Section>
    </>
  )
}
