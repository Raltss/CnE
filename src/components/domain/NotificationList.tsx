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
          <li key={n.id} className={cx('flex items-start gap-3 px-4 py-3', unread && 'bg-primary/5')}>
            <span
              className={cx(
                'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
                unread ? 'bg-primary text-on-primary' : 'bg-surface-2 text-muted-fg',
              )}
            >
              <Icon aria-hidden className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              {packageId ? (
                <button
                  type="button"
                  onClick={() => open(n, packageId)}
                  className={cx('text-left text-sm underline-offset-2 hover:text-primary hover:underline', unread ? 'font-semibold' : 'text-fg')}
                >
                  {n.message}
                </button>
              ) : (
                // The package was deleted: nothing to open.
                <p className={cx('text-sm', unread ? 'font-semibold' : 'text-fg')}>{n.message}</p>
              )}
              <p className="flex items-center gap-2 text-xs text-muted-fg tabular-nums">
                {unread && <span className="font-semibold text-primary">Unread</span>}
                {formatDateTime(n.createdAt)}
              </p>
            </div>
            {unread && (
              <button
                type="button"
                onClick={() => markRead(n)}
                className="shrink-0 rounded-md px-2 py-1.5 text-xs font-semibold text-primary hover:bg-surface-2"
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
