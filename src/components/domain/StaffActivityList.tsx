import { CircleCheck, CircleOff, History, Pencil, RefreshCw, UserPlus, UserRoundCog, type LucideIcon } from 'lucide-react'
import { makeLookup } from '../../data/selectors'
import type { AppState, StaffActivity, StaffChangeType } from '../../data/types'
import { formatDateTime } from '../../lib/time'
import { EmptyState } from '../ui/EmptyState'

const ICONS: Record<StaffChangeType, LucideIcon> = {
  account_created: UserPlus,
  approved: CircleCheck,
  role_changed: UserRoundCog,
  deactivated: CircleOff,
  reactivated: RefreshCw,
  details_changed: Pencil,
}

/** Changes from the SQL editor (or a new sign-up) have no signed-in admin to name. */
const TRUSTED_SETUP = 'Trusted setup (SQL editor)'

interface StaffActivityListProps {
  state: AppState
  entries: StaffActivity[]
  /** Name the account in each entry (the all-accounts history). */
  showAccount?: boolean
  label: string
}

/** Account history: what changed, who changed it, and when. */
export function StaffActivityList({ state, entries, showAccount, label }: StaffActivityListProps) {
  const accounts = new Map(state.accounts.map((a) => [a.id, a.name]))
  const lookup = makeLookup(state)
  if (!entries.length) return <EmptyState icon={History} title="No account changes yet" compact />
  return (
    <ol className="divide-y divide-border" aria-label={label}>
      {entries.map((e) => {
        const Icon = ICONS[e.type]
        return (
          <li key={e.id} className="flex gap-3 px-4 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted-fg">
              <Icon aria-hidden className="size-4" />
            </span>
            <div className="min-w-0 text-sm">
              <p>
                {showAccount && <span className="font-semibold">{accounts.get(e.profileId) ?? 'Unknown account'} · </span>}
                {e.message}
              </p>
              <p className="text-xs text-muted-fg tabular-nums">
                By {e.actorId ? lookup.personName(e.actorId) : TRUSTED_SETUP} · {formatDateTime(e.at)}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
