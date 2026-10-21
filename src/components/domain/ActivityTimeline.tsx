import {
  CalendarClock,
  Check,
  History,
  PackagePlus,
  Pencil,
  Play,
  RotateCcw,
  Upload,
  UserRound,
  Users,
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
}

/** `events` are newest first, as the package query returns them. */
export function ActivityTimeline({ events, lookup }: { events: ActivityEvent[]; lookup: Lookup }) {
  if (!events.length) return <EmptyState icon={History} title="No activity yet" compact />
  return (
    <ol className="relative flex flex-col gap-4 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-border">
      {events.map((e) => {
        const Icon = ICONS[e.type]
        return (
          <li key={e.id} className="relative flex gap-3">
            <span className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted-fg">
              <Icon aria-hidden className="size-4" />
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-sm">
                <span className="font-semibold">{lookup.personName(e.actorId)}</span> · {e.message}
              </p>
              <p className="text-xs text-muted-fg tabular-nums">{formatDateTime(e.at)}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
