import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { isActive, isOverdue, type Lookup } from '../../data/selectors'
import type { PackageSummary } from '../../data/types'
import { cx } from '../../lib/styles'
import { formatDateTime, formatDue } from '../../lib/time'
import { DeadlineBadge } from './DeadlineBadge'
import { OverdueBadge, StatusBadge } from './StatusBadge'
import { RunwayTrack } from './Track'
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

/** Dense table on ≥768px; compact rows on phones. */
export function PackageTable({ lookup, packages, now, columns: requested, caption, action, linkState }: PackageTableProps) {
  const wide = useIsWide()
  // The product reads as the package's context, so it sits under the title instead of in a narrow column.
  const withProduct = requested.includes('product')
  const columns = requested.filter((c) => c !== 'product')
  const title = (pkg: PackageSummary) => (
    <span className="flex min-w-0 flex-col gap-0.5">
      <Link to={`/packages/${pkg.id}`} state={linkState} className="font-medium text-fg decoration-border-strong underline-offset-4 hover:underline">
        {pkg.title}
      </Link>
      <span className="text-sm text-muted-fg">
        <span className="font-mono">{pkg.code}</span>
        {pkg.latest && (
          <>
            {' · '}
            <span className="font-mono">R{pkg.latest.round}</span>
          </>
        )}
        {withProduct && wide && <> · {lookup.productName(pkg.productId)}</>}
      </span>
    </span>
  )
  const status = (pkg: PackageSummary) => (
    <span className="flex flex-wrap gap-1">
      <StatusBadge status={pkg.status} />
      {isOverdue(pkg, now) && <OverdueBadge />}
    </span>
  )
  const cell = (pkg: PackageSummary, col: PackageColumn): ReactNode => {
    switch (col) {
      case 'package':
        return title(pkg)
      case 'product':
        return <span className="text-muted-fg">{lookup.productName(pkg.productId)}</span>
      case 'editor':
        return lookup.personName(pkg.editorId)
      case 'manager':
        return lookup.personName(pkg.responsibleManagerId)
      case 'status':
        return status(pkg)
      case 'deadline':
        return (
          <span className="flex items-center gap-3">
            {wide && isActive(pkg) && <RunwayTrack deadline={pkg.deadline} now={now} />}
            <DeadlineBadge pkg={pkg} now={now} />
          </span>
        )
      case 'round':
        return pkg.latest ? <span className="font-mono">R{pkg.latest.round}</span> : <span className="text-muted-fg">—</span>
      case 'submitted':
        return pkg.latest ? (
          <span className="whitespace-nowrap" title={formatDateTime(pkg.latest.submittedAt)}>
            {formatDue(pkg.latest.submittedAt, now)}
          </span>
        ) : (
          <span className="text-muted-fg">—</span>
        )
    }
  }

  return wide ? (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-ui">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-2 text-sm text-muted-fg">
          <tr>
            {columns.map((col) => (
              <th key={col} scope="col" className="h-10 px-4 font-medium whitespace-nowrap first:pl-5">
                {HEAD[col]}
              </th>
            ))}
            {action && (
              <th scope="col" className="h-10 px-4 pr-5 text-right">
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {packages.map((pkg) => (
            <tr key={pkg.id} className="border-t border-border transition-colors duration-120 hover:bg-surface-2/50">
              {columns.map((col) => (
                <td key={col} className={cx('px-4 py-3 align-middle first:pl-5', col === 'package' && 'min-w-64')}>
                  {cell(pkg, col)}
                </td>
              ))}
              {action && <td className="px-4 py-3 pr-5 text-right align-middle whitespace-nowrap">{action(pkg)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <ul className="divide-y divide-border border-t border-border" aria-label={caption}>
      {packages.map((pkg) => (
        <li key={pkg.id} className="flex flex-col gap-2 px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            {title(pkg)}
            {columns.includes('status') && status(pkg)}
          </div>
          <p className="text-sm text-muted-fg">
            {[
              withProduct && lookup.productName(pkg.productId),
              columns.includes('editor') && lookup.personName(pkg.editorId),
              columns.includes('manager') && `Responsible: ${lookup.personName(pkg.responsibleManagerId)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <div className="flex items-end justify-between gap-3">
            {columns.includes('deadline') ? <DeadlineBadge pkg={pkg} now={now} /> : columns.includes('submitted') ? cell(pkg, 'submitted') : <span />}
            {action && <div className="shrink-0">{action(pkg)}</div>}
          </div>
        </li>
      ))}
    </ul>
  )
}
