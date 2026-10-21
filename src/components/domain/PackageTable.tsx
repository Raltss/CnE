import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { isOverdue, lastSubmittedAt, makeLookup, roundCount } from '../../data/selectors'
import type { AppState, WorkPackage } from '../../data/types'
import { cx } from '../../lib/styles'
import { formatDateTime } from '../../lib/time'
import { DeadlineBadge } from './DeadlineBadge'
import { OverdueBadge, StatusBadge } from './StatusBadge'

export type PackageColumn = 'package' | 'clientProduct' | 'editor' | 'manager' | 'status' | 'deadline' | 'round' | 'submitted'

interface PackageTableProps {
  state: AppState
  packages: WorkPackage[]
  now: Date
  columns: PackageColumn[]
  caption: string
  /** Optional per-row action (e.g. Start / Review). */
  action?: (pkg: WorkPackage) => ReactNode
}

const HEAD: Record<PackageColumn, string> = {
  package: 'Package',
  clientProduct: 'Client / Product',
  editor: 'Editor',
  manager: 'Responsible',
  status: 'Status',
  deadline: 'Deadline',
  round: 'Round',
  submitted: 'Submitted',
}

/** Dense table on ≥768px; stacked cards on mobile. */
export function PackageTable({ state, packages, now, columns, caption, action }: PackageTableProps) {
  const lookup = makeLookup(state)

  const cell = (pkg: WorkPackage, col: PackageColumn): ReactNode => {
    switch (col) {
      case 'package':
        return (
          <span className="flex flex-col">
            <Link to={`/packages/${pkg.id}`} className="font-semibold text-fg underline-offset-2 hover:text-primary hover:underline">
              {pkg.title}
            </Link>
            <span className="text-xs text-muted-fg tabular-nums">{pkg.code}</span>
          </span>
        )
      case 'clientProduct':
        return (
          <span className="flex flex-col">
            <span>{lookup.clientName(pkg.clientId)}</span>
            <span className="text-xs text-muted-fg">{lookup.productName(pkg.productId)}</span>
          </span>
        )
      case 'editor':
        return lookup.personName(pkg.editorId)
      case 'manager':
        return lookup.personName(pkg.responsibleManagerId)
      case 'status':
        return (
          <span className="flex flex-wrap gap-1">
            <StatusBadge status={pkg.status} />
            {isOverdue(pkg, now) && <OverdueBadge />}
          </span>
        )
      case 'deadline':
        return <DeadlineBadge pkg={pkg} now={now} />
      case 'round': {
        const rounds = roundCount(state, pkg.id)
        return rounds ? <span className="tabular-nums">Round {rounds}</span> : <span className="text-muted-fg">—</span>
      }
      case 'submitted': {
        const at = lastSubmittedAt(state, pkg.id)
        return at ? <span className="tabular-nums">{formatDateTime(at)}</span> : <span className="text-muted-fg">—</span>
      }
    }
  }

  return (
    <>
      <table className="hidden w-full border-collapse text-left text-sm md:table">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-2 text-xs font-semibold text-muted-fg">
          <tr>
            {columns.map((col) => (
              <th key={col} scope="col" className="px-4 py-2 whitespace-nowrap">
                {HEAD[col]}
              </th>
            ))}
            {action && (
              <th scope="col" className="px-4 py-2 text-right">
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {packages.map((pkg) => (
            <tr key={pkg.id} className="border-t border-border align-top transition-colors duration-150 hover:bg-surface-2/60">
              {columns.map((col) => (
                <td key={col} className={cx('px-4 py-3', col === 'package' && 'min-w-48')}>
                  {cell(pkg, col)}
                </td>
              ))}
              {action && <td className="px-4 py-3 text-right whitespace-nowrap">{action(pkg)}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-border md:hidden" aria-label={caption}>
        {packages.map((pkg) => (
          <li key={pkg.id} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              {cell(pkg, 'package')}
              {cell(pkg, 'status')}
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              {columns
                .filter((c) => c !== 'package' && c !== 'status')
                .map((col) => (
                  <div key={col} className="min-w-0">
                    <dt className="text-xs text-muted-fg">{HEAD[col]}</dt>
                    <dd className="min-w-0 break-words">{cell(pkg, col)}</dd>
                  </div>
                ))}
            </dl>
            {action && <div className="flex justify-end">{action(pkg)}</div>}
          </li>
        ))}
      </ul>
    </>
  )
}
