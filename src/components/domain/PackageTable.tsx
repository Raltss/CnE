import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { isOverdue, type Lookup } from '../../data/selectors'
import type { PackageSummary } from '../../data/types'
import { cx } from '../../lib/styles'
import { formatDateTime } from '../../lib/time'
import { DeadlineBadge } from './DeadlineBadge'
import { OverdueBadge, StatusBadge } from './StatusBadge'
import { useIsWide } from '../../data/hooks'

export type PackageColumn = 'package' | 'product' | 'editor' | 'manager' | 'status' | 'deadline' | 'round' | 'submitted'

interface PackageTableProps {
  lookup: Lookup
  packages: PackageSummary[]
  now: Date
  columns: PackageColumn[]
  caption: string
  /** Optional per-row action (e.g. Start / Review). */
  action?: (pkg: PackageSummary) => ReactNode
  /** Router state for the package links, e.g. so the package page's Back returns here. */
  linkState?: unknown
}

const HEAD: Record<PackageColumn, string> = {
  package: 'Package',
  product: 'Product',
  editor: 'Editor',
  manager: 'Responsible',
  status: 'Status',
  deadline: 'Deadline',
  round: 'Round',
  submitted: 'Submitted',
}

/** Dense table on ≥768px; stacked cards on mobile. */
export function PackageTable({ lookup, packages, now, columns, caption, action, linkState }: PackageTableProps) {
  const wide = useIsWide()
  const cell = (pkg: PackageSummary, col: PackageColumn): ReactNode => {
    switch (col) {
      case 'package':
        return (
          <span className="flex flex-col">
            <Link to={`/packages/${pkg.id}`} state={linkState} className="font-semibold text-fg underline-offset-2 hover:text-primary hover:underline">
              {pkg.title}
            </Link>
            <span className="text-xs text-muted-fg tabular-nums">{pkg.code}</span>
          </span>
        )
      case 'product':
        return lookup.productName(pkg.productId)
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
      case 'round':
        return pkg.latest ? <span className="tabular-nums">Round {pkg.latest.round}</span> : <span className="text-muted-fg">—</span>
      case 'submitted':
        return pkg.latest ? <span className="tabular-nums">{formatDateTime(pkg.latest.submittedAt)}</span> : <span className="text-muted-fg">—</span>
    }
  }

  return (
    <>
      {wide ? (
        <table className="w-full border-collapse text-left text-sm">
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
      ) : (
        <ul className="divide-y divide-border" aria-label={caption}>
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
      )}
    </>
  )
}
