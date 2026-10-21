import { Link } from 'react-router'
import { makeLookup, isOverdue } from '../../data/selectors'
import type { AppState, WorkPackage } from '../../data/types'
import { DeadlineBadge } from './DeadlineBadge'
import { OverdueBadge, StatusBadge } from './StatusBadge'

interface PackageListProps {
  state: AppState
  packages: WorkPackage[]
  now: Date
  /** Accessible name for the list. */
  label: string
  /** Hide the editor name, e.g. when the list is already scoped to one editor. */
  hideEditor?: boolean
}

/** Roomy, readable package rows for dialogs and the deadlines page. */
export function PackageList({ state, packages, now, label, hideEditor }: PackageListProps) {
  const lookup = makeLookup(state)
  return (
    <ul className="divide-y divide-border" aria-label={label}>
      {packages.map((pkg) => (
        <li key={pkg.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <Link to={`/packages/${pkg.id}`} className="font-semibold hover:text-primary hover:underline">
              {pkg.title}
            </Link>
            <p className="mt-0.5 text-sm text-muted-fg">
              {lookup.clientName(pkg.clientId)} · {lookup.productName(pkg.productId)}
              {!hideEditor && <> · {lookup.personName(pkg.editorId)}</>}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 sm:flex-col sm:items-end">
            <span className="flex gap-1.5">
              <StatusBadge status={pkg.status} />
              {isOverdue(pkg, now) && <OverdueBadge />}
            </span>
            <DeadlineBadge pkg={pkg} now={now} />
          </div>
        </li>
      ))}
    </ul>
  )
}
