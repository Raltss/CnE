import { ChartColumn, CircleCheck, Clock3, Layers, PackageCheck, Timer, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { KpiStat } from '../components/domain/KpiStat'
import { ViewOnlyBanner } from '../components/domain/ViewOnlyBanner'
import { EmptyState } from '../components/ui/EmptyState'
import { FilterSelect } from '../components/ui/FilterSelect'
import { PageStatus } from '../components/ui/PageStatus'
import { PageHeader, Section } from '../components/ui/Section'
import { useIsWide, useNow } from '../data/hooks'
import { pageStatus, useDirectory, usePackageReport } from '../data/queries'
import { average, groupBy, packageRevisions, percent, summarize, type ReportSummary } from '../data/reports'
import { editors } from '../data/selectors'
import { backState } from '../lib/back'
import { cardClasses, cx } from '../lib/styles'
import { addDays, formatDayRange, formatDistance, manilaDateKey, manilaDayStart } from '../lib/time'
import { useSession } from '../session/context'

const PERIODS = {
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  month: 'This month',
  'last-month': 'Last month',
  year: 'This year',
} as const
type Period = keyof typeof PERIODS

/** First and last Manila day of a period, both inclusive. */
function periodDays(period: Period, today: string): [string, string] {
  const monthStart = `${today.slice(0, 8)}01`
  switch (period) {
    case '30d':
      return [addDays(today, -29), today]
    case '90d':
      return [addDays(today, -89), today]
    case 'month':
      return [monthStart, today]
    case 'last-month': {
      const last = addDays(monthStart, -1)
      return [`${last.slice(0, 8)}01`, last]
    }
    case 'year':
      return [`${today.slice(0, 4)}-01-01`, today]
  }
}

/**
 * Delivery and revision reports for managers (admins read them too). Counts packages by
 * when they were first delivered: sent to the client, or approved without client review.
 */
export function Reports() {
  const now = useNow()
  const wide = useIsWide()
  const location = useLocation()
  const { me } = useSession()
  const [params, setParams] = useSearchParams()
  const { people, products, lookup, queries } = useDirectory()

  const period: Period = (params.get('period') ?? '') in PERIODS ? (params.get('period') as Period) : '30d'
  const [first, last] = periodDays(period, manilaDateKey(now.toISOString()))
  const report = usePackageReport({ from: manilaDayStart(first), to: manilaDayStart(addDays(last, 1)) })
  const productFilter = params.get('product') ?? ''
  const editorFilter = params.get('editor') ?? ''
  const linkState = backState(location, 'Reports')

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const header = (
    <PageHeader
      title="Reports"
      description="Deliveries, deadlines, and revisions, counted by when each package first went out. Times are in Manila (PHT)."
    />
  )
  const filters = (
    <form role="search" aria-label="Report filters" className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3" onSubmit={(e) => e.preventDefault()}>
      <FilterSelect
        id="report-period"
        label="Period"
        value={period}
        onChange={(value) => set('period', value === '30d' ? '' : value)}
        options={Object.entries(PERIODS).map(([value, label]) => ({ value, label }))}
      />
      <FilterSelect
        id="report-product"
        label="Product"
        value={productFilter}
        onChange={(value) => set('product', value)}
        options={products.map((p) => ({ value: p.id, label: p.name }))}
        all="All products"
      />
      <FilterSelect
        id="report-editor"
        label="Editor"
        value={editorFilter}
        onChange={(value) => set('editor', value)}
        options={editors(people).map((p) => ({ value: p.id, label: p.name }))}
        all="All editors"
      />
    </form>
  )

  const status = pageStatus(report, ...queries)
  if (status.pending || status.error)
    return (
      <>
        {header}
        {filters}
        <PageStatus {...status} />
      </>
    )

  const includedFor = (productId: string) => products.find((p) => p.id === productId)?.includedRevisions ?? null
  const rows = report.data!.filter((p) => (!productFilter || p.productId === productFilter) && (!editorFilter || p.editorId === editorFilter))
  const total = summarize(rows, includedFor)
  const byEditor = [...groupBy(rows, (p) => p.editorId)].map(([id, list]) => ({ id, name: lookup.personName(id), summary: summarize(list, includedFor) }))
  const byProduct = [...groupBy(rows, (p) => p.productId)].map(([id, list]) => ({
    id,
    name: lookup.productName(id),
    included: includedFor(id),
    summary: summarize(list, includedFor),
  }))
  const overAllowance = rows
    .map((pkg) => ({ pkg, ...packageRevisions(pkg, includedFor(pkg.productId)) }))
    .filter((r) => r.extra > 0)
    .sort((a, b) => b.extra - a.extra || a.pkg.firstDeliveredAt.localeCompare(b.pkg.firstDeliveredAt))

  return (
    <>
      {header}
      {me.role === 'admin' && <ViewOnlyBanner>Reports are the same for managers and admins.</ViewOnlyBanner>}
      {filters}
      <p className="mb-4 text-sm text-muted-fg tabular-nums" aria-live="polite">
        {formatDayRange(first, last)} · {total.delivered} {total.delivered === 1 ? 'package' : 'packages'} delivered
        {report.isFetching && ' · Updating…'}
      </p>

      {total.delivered === 0 ? (
        <Section title="Nothing delivered">
          <EmptyState icon={ChartColumn} title="No packages were delivered in this period">
            A package counts once it’s sent to the client or approved. Try a longer period or another filter.
          </EmptyState>
        </Section>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 2xl:grid-cols-6">
            <KpiStat label="Delivered" value={total.delivered} hint="Sent to the client or completed" icon={PackageCheck} />
            <KpiStat label="On time" display={percent(total.onTime, total.delivered)} hint={`${total.onTime} of ${total.delivered} by the deadline`} icon={Clock3} />
            <KpiStat
              label="First-pass approval"
              display={percent(total.firstPass, total.delivered)}
              hint="Round 1 approved as submitted"
              icon={CircleCheck}
            />
            <KpiStat label="Rounds per package" display={average(total.rounds, total.delivered)} hint="Average, all rounds" icon={Layers} />
            <KpiStat
              label="Turnaround"
              display={total.turnaroundMs === null ? '—' : formatDistance(total.turnaroundMs)}
              hint="Median, created to first delivery"
              icon={Timer}
            />
            <KpiStat
              label="Extra client revisions"
              value={total.extraRevisions}
              hint={`Of ${total.clientRevisions} client revisions · ${total.overAllowance} ${total.overAllowance === 1 ? 'package' : 'packages'} over`}
              icon={TriangleAlert}
              tone="attention"
            />
          </div>

          <RevisionSources summary={total} />

          <Section title="By editor" description="Packages each editor delivered in the period" flush>
            <BreakdownTable
              wide={wide}
              caption="Delivery and revisions by editor"
              rowHeader="Editor"
              rows={byEditor.sort((a, b) => b.summary.delivered - a.summary.delivered || a.name.localeCompare(b.name))}
              columns={[
                { head: 'Delivered', cell: (r) => r.summary.delivered },
                { head: 'On time', cell: (r) => <Meter part={r.summary.onTime} whole={r.summary.delivered} /> },
                { head: 'First pass', cell: (r) => <Meter part={r.summary.firstPass} whole={r.summary.delivered} /> },
                { head: 'Rounds / package', cell: (r) => average(r.summary.rounds, r.summary.delivered) },
                { head: 'Internal revisions', cell: (r) => r.summary.internalRevisions },
                { head: 'Client revisions', cell: (r) => r.summary.clientRevisions },
                { head: 'Turnaround', cell: (r) => (r.summary.turnaroundMs === null ? '—' : formatDistance(r.summary.turnaroundMs)) },
              ]}
            />
          </Section>

          <Section title="By product" description="Client revisions against what each product includes" flush>
            <BreakdownTable
              wide={wide}
              caption="Delivery and revisions by product"
              rowHeader="Product"
              rows={byProduct.sort((a, b) => b.summary.extraRevisions - a.summary.extraRevisions || b.summary.delivered - a.summary.delivered)}
              columns={[
                { head: 'Delivered', cell: (r) => r.summary.delivered },
                { head: 'Included per package', cell: (r) => (r.included === null ? 'No limit' : r.included) },
                { head: 'Client revisions', cell: (r) => r.summary.clientRevisions },
                {
                  head: 'Extra revisions',
                  cell: (r) =>
                    r.summary.extraRevisions > 0 ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-warning">
                        <TriangleAlert aria-hidden className="size-3.5" />
                        {r.summary.extraRevisions}
                      </span>
                    ) : (
                      0
                    ),
                },
                { head: 'Packages over', cell: (r) => r.summary.overAllowance },
                { head: 'On time', cell: (r) => <Meter part={r.summary.onTime} whole={r.summary.delivered} /> },
              ]}
            />
          </Section>

          <Section
            title={`Over the revision allowance (${overAllowance.length})`}
            description="Packages whose client revisions went past what the product includes, most extra first"
            flush
          >
            {overAllowance.length ? (
              <ul className="divide-y divide-border">
                {overAllowance.map(({ pkg, client, extra }) => (
                  <li key={pkg.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <span className="min-w-0">
                      <Link to={`/packages/${pkg.id}`} state={linkState} className="font-semibold underline-offset-2 hover:text-primary hover:underline">
                        {pkg.title}
                      </Link>
                      <span className="block text-xs text-muted-fg tabular-nums">
                        {pkg.code} · {lookup.productName(pkg.productId)} · {lookup.personName(pkg.editorId)}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-warning tabular-nums">
                      <TriangleAlert aria-hidden className="size-4" />
                      {client} client revisions · {extra} extra (of {includedFor(pkg.productId)} included)
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={CircleCheck} title="Every package stayed within its allowance" compact>
                Set the included revisions per product in Packages → Products.
              </EmptyState>
            )}
          </Section>

          <details className={cx(cardClasses, 'p-4 text-sm')}>
            <summary className="font-semibold">How these are counted</summary>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-muted-fg">
              <li>
                <strong className="text-fg">Delivered</strong>: the first time a package was sent to the client, or approved and completed without client
                review. Later reopens don’t move it.
              </li>
              <li>
                <strong className="text-fg">On time</strong>: delivered at or before the final deadline.
              </li>
              <li>
                <strong className="text-fg">First-pass approval</strong>: Round 1 was approved (sent to the client or completed) without the manager asking
                for changes.
              </li>
              <li>
                <strong className="text-fg">Internal revisions</strong> are rounds a manager sent back; <strong className="text-fg">client revisions</strong>{' '}
                are rounds the client sent back. Extra revisions are client revisions beyond the product’s included number.
              </li>
              <li>
                <strong className="text-fg">Turnaround</strong>: the median time from creating the package to its first delivery.
              </li>
            </ul>
          </details>
        </div>
      )}
    </>
  )
}

/**
 * Where revisions came from: one stacked bar (internal vs client) with a legend and direct
 * labels, so identity never rests on color alone. Chart colors validated for both themes.
 */
function RevisionSources({ summary }: { summary: ReportSummary }) {
  const all = summary.internalRevisions + summary.clientRevisions
  const parts = [
    { key: 'internal', label: 'Internal (manager sent back)', value: summary.internalRevisions, swatch: 'bg-chart-1' },
    { key: 'client', label: 'Client (client sent back)', value: summary.clientRevisions, swatch: 'bg-chart-2' },
  ]
  return (
    <Section title="Where revisions came from" description={`${all} ${all === 1 ? 'revision' : 'revisions'} on the packages delivered in this period`}>
      {all === 0 ? (
        <p className="text-sm text-muted-fg">No revisions: every package was approved on its first round.</p>
      ) : (
        <figure className="flex flex-col gap-3">
          <div className="flex h-4 w-full gap-0.5" role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(', ')}>
            {parts
              .filter((p) => p.value > 0)
              .map((p, i, shown) => (
                <span
                  key={p.key}
                  title={`${p.label}: ${p.value} (${percent(p.value, all)})`}
                  className={cx('h-full', p.swatch, i === 0 && 'rounded-l', i === shown.length - 1 && 'rounded-r')}
                  style={{ width: `${(p.value / all) * 100}%` }}
                />
              ))}
          </div>
          <figcaption>
            <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {parts.map((p) => (
                <li key={p.key} className="flex items-center gap-2">
                  <span aria-hidden className={cx('size-2.5 rounded-sm', p.swatch)} />
                  <span>{p.label}</span>
                  <span className="font-semibold tabular-nums">
                    {p.value} ({percent(p.value, all)})
                  </span>
                </li>
              ))}
            </ul>
            {summary.clientResponseMs !== null && (
              <p className="mt-2 text-xs text-muted-fg">Clients took {formatDistance(summary.clientResponseMs)} to decide (median).</p>
            )}
          </figcaption>
        </figure>
      )}
    </Section>
  )
}

/** A share as text, with a thin bar on a lighter track of the same hue. */
function Meter({ part, whole }: { part: number; whole: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="h-1.5 w-14 overflow-hidden rounded-full bg-primary/15">
        <span className="block h-full rounded-full bg-primary" style={{ width: whole ? `${(part / whole) * 100}%` : 0 }} />
      </span>
      <span className="tabular-nums">{percent(part, whole)}</span>
    </span>
  )
}

interface Column<T> {
  head: string
  cell: (row: T) => ReactNode
}

/** A table on wide screens, stacked cards on phones (no horizontal page scroll). */
function BreakdownTable<T extends { id: string; name: string }>({
  wide,
  caption,
  rowHeader,
  rows,
  columns,
}: {
  wide: boolean
  caption: string
  rowHeader: string
  rows: T[]
  columns: Column<T>[]
}) {
  if (!wide)
    return (
      <ul className="divide-y divide-border" aria-label={caption}>
        {rows.map((row) => (
          <li key={row.id} className="px-4 py-3">
            <p className="font-semibold">{row.name}</p>
            <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              {columns.map((col) => (
                <div key={col.head} className="min-w-0">
                  <dt className="text-xs text-muted-fg">{col.head}</dt>
                  <dd className="tabular-nums">{col.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    )
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-2 text-xs font-semibold text-muted-fg">
          <tr>
            <th scope="col" className="px-4 py-2">
              {rowHeader}
            </th>
            {columns.map((col) => (
              <th key={col.head} scope="col" className="px-4 py-2 whitespace-nowrap">
                {col.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-border hover:bg-surface-2/60">
              <th scope="row" className="px-4 py-3 font-semibold">
                {row.name}
              </th>
              {columns.map((col) => (
                <td key={col.head} className="px-4 py-3 whitespace-nowrap tabular-nums">
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
