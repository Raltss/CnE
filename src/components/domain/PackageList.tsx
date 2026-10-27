import { Link } from 'react-router'
import { isActive, isOverdue, type Lookup } from '../../data/selectors'
import type { PackageSummary } from '../../data/types'
import { DeadlineBadge } from './DeadlineBadge'
import { OverdueBadge, StatusBadge } from './StatusBadge'
import { RunwayTrack } from './Track'

interface PackageListProps {
  lookup: Lookup
  packages: PackageSummary[]
  now: Date
  /** Accessible name for the list. */
  label: string
  /** Hide the editor name, e.g. when the list is already scoped to one editor. */
  hideEditor?: boolean
}

/** Roomy, readable package rows for dialogs and the deadlines page. */
export function PackageList({ lookup, packages, now, label, hideEditor }: PackageListProps) {
  return (
    <ul className="divide-y divide-border" aria-label={label}>
      {packages.map((pkg) => (
        <li key={pkg.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <Link to={`/packages/${pkg.id}`} className="font-medium text-fg decoration-border-strong underline-offset-4 hover:underline">
              {pkg.title}
            </Link>
            <p className="mt-0.5 text-sm text-muted-fg">
              <span className="font-mono">{pkg.code}</span>
              {pkg.latest && (
                <>
                  {' · '}
                  <span className="font-mono">R{pkg.latest.round}</span>
                </>
              )}
              {' · '}
              {lookup.productName(pkg.productId)}
              {!hideEditor && <> · {lookup.personName(pkg.editorId)}</>}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2">
            <span className="flex gap-1.5">
              <StatusBadge status={pkg.status} />
              {isOverdue(pkg, now) && <OverdueBadge />}
            </span>
            {isActive(pkg) && <RunwayTrack deadline={pkg.deadline} now={now} className="hidden sm:inline-block" />}
            <span className="sm:min-w-36 sm:text-right">
              <DeadlineBadge pkg={pkg} now={now} />
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}
