import { TriangleAlert } from 'lucide-react'
import { accessOf } from '../../data/selectors'
import type { PackageStatus, Role, StaffAccount, SubmissionOutcome } from '../../data/types'
import { ACCESS_META, OUTCOME_META, ROLE_META, STATUS_META, type StatusMeta } from '../../lib/status'
import { cx } from '../../lib/styles'

const badge = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap'

/** Always icon + label, never color alone. */
function MetaBadge({ meta }: { meta: StatusMeta }) {
  const Icon = meta.icon
  return (
    <span className={cx(badge, meta.className)}>
      <Icon aria-hidden className="size-3.5" strokeWidth={2.5} />
      {meta.label}
    </span>
  )
}

export const StatusBadge = ({ status }: { status: PackageStatus }) => <MetaBadge meta={STATUS_META[status]} />

export const OutcomeBadge = ({ outcome }: { outcome: SubmissionOutcome }) => <MetaBadge meta={OUTCOME_META[outcome]} />

export const AccessBadge = ({ account }: { account: Pick<StaffAccount, 'role' | 'isActive'> }) => (
  <MetaBadge meta={ACCESS_META[accessOf(account)]} />
)

/** Neutral pill: the role is information, not a state that needs attention. */
export function RoleBadge({ role }: { role: Role | null }) {
  const meta = role ? ROLE_META[role] : null
  const Icon = meta?.icon
  return (
    <span className={cx(badge, 'bg-surface-2 text-fg')}>
      {Icon && <Icon aria-hidden className="size-3.5" strokeWidth={2.5} />}
      {meta?.label ?? 'No role'}
    </span>
  )
}

export function OverdueBadge() {
  return (
    <span className={cx(badge, 'bg-st-overdue-bg text-st-overdue')}>
      <TriangleAlert aria-hidden className="size-3.5" strokeWidth={2.5} />
      Overdue
    </span>
  )
}
