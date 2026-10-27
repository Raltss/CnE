import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  Check,
  CircleCheck,
  History,
  MessageSquareReply,
  PackagePlus,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Send,
  Truck,
  Undo2,
  Upload,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { Lookup } from '../../data/selectors'
import type { ActivityEvent, ActivityType } from '../../data/types'
import { formatDateTime } from '../../lib/time'
import { EmptyState } from '../ui/EmptyState'

const ICONS: Record<ActivityType, LucideIcon> = {
  created: PackagePlus,
  reassigned: Users,
  started: Play,
  submitted: Upload,
  feedback: RotateCcw,
  approved: Check,
  deadline_changed: CalendarClock,
  manager_changed: UserRound,
  edited: Pencil,
  held: Pause,
  resumed: Play,
  cancelled: X,
  archived: Archive,
  unarchived: ArchiveRestore,
  reopened: Undo2,
  sent_to_client: Send,
  client_approved: CircleCheck,
  client_feedback: MessageSquareReply,
  delivery_added: Truck,
}

/** `events` are newest first, as the package query returns them. */
export function ActivityTimeline({ events, lookup }: { events: ActivityEvent[]; lookup: Lookup }) {
  if (!events.length) return <EmptyState icon={History} title="No activity yet" compact />
  return (
    <ol className="relative flex flex-col gap-4 before:absolute before:top-3 before:bottom-3 before:left-3.5 before:w-px before:bg-border">
      {events.map((e) => {
        const Icon = ICONS[e.type]
        return (
          <li key={e.id} className="relative flex gap-3">
            <span className="z-10 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted-fg ring-4 ring-surface">
              <Icon aria-hidden className="size-3.5" />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-ui">
                <span className="font-medium">{lookup.personName(e.actorId)}</span> <span className="text-muted-fg">·</span> {e.message}
              </p>
              <p className="text-sm text-muted-fg">{formatDateTime(e.at)}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
