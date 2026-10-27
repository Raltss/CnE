import {
  BellOff,
  CalendarClock,
  Check,
  CircleCheck,
  MessageSquareReply,
  PackagePlus,
  Pause,
  Play,
  RotateCcw,
  Send,
  Trash2,
  Truck,
  Undo2,
  Upload,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useNavigate } from 'react-router'
import { api } from '../../data/api'
import type { AppNotification, NotificationType } from '../../data/types'
import { cx } from '../../lib/styles'
import { formatDateTime } from '../../lib/time'
import { EmptyState } from '../ui/EmptyState'
import { useToast } from '../ui/toast-context'

const ICONS: Record<NotificationType, LucideIcon> = {
  assigned: PackagePlus,
  reassigned_away: Users,
  submitted: Upload,
  feedback: RotateCcw,
  approved: Check,
  deadline_changed: CalendarClock,
  manager_changed: UserRound,
  on_hold: Pause,
  resumed: Play,
  cancelled: X,
  reopened: Undo2,
  deleted: Trash2,
  sent_to_client: Send,
  client_approved: CircleCheck,
  client_feedback: MessageSquareReply,
  delivery_added: Truck,
}

export function NotificationList({ items, personId, emptyText }: { items: AppNotification[]; personId: string; emptyText: string }) {
  const navigate = useNavigate()
  const toast = useToast()
  if (!items.length)
    return (
      <EmptyState icon={BellOff} title={emptyText}>
        You’ll be notified here about assignments, submissions, feedback, and approvals.
      </EmptyState>
    )

  const open = (n: AppNotification, packageId: string) => {
    // Opening counts as reading; don't wait for the server before navigating.
    if (!n.readAt) void api.markNotificationRead(personId, n.id)
    navigate(`/packages/${packageId}`)
  }
  const markRead = async (n: AppNotification) => {
    const result = await api.markNotificationRead(personId, n.id)
    if (!result.ok) toast.show(result.error, 'error')
  }

  return (
    <ul className="divide-y divide-border">
      {items.map((n) => {
        const Icon = ICONS[n.type]
        const unread = !n.readAt
        const packageId = n.packageId
        return (
          <li key={n.id} data-seenry-dot={unread ? 'unread' : undefined} className={cx('relative flex items-start gap-3 py-3.5 pr-4 pl-6', unread && 'bg-surface-2/50')}>
            {unread && <span aria-hidden className="absolute top-6 left-2.5 size-1.5 rounded-full bg-fg" />}
            <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2', unread ? 'text-fg' : 'text-muted-fg')}>
              <Icon aria-hidden className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              {packageId ? (
                <button
                  type="button"
                  onClick={() => open(n, packageId)}
                  className={cx('text-left text-ui decoration-border-strong underline-offset-4 hover:underline', unread ? 'font-medium text-fg' : 'text-fg')}
                >
                  {n.message}
                </button>
              ) : (
                // The package was deleted: nothing to open.
                <p className={cx('text-ui', unread ? 'font-medium' : 'text-fg')}>{n.message}</p>
              )}
              <p className="mt-0.5 flex items-center gap-2 text-sm text-muted-fg">
                {unread && <span className="font-medium text-fg">Unread</span>}
                {formatDateTime(n.createdAt)}
              </p>
            </div>
            {unread && (
              <button
                type="button"
                onClick={() => markRead(n)}
                className="shrink-0 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-fg transition-colors duration-120 hover:bg-surface-2 hover:text-fg"
              >
                Mark read
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
