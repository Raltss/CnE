import { Hourglass } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { PackageTable } from '../../components/domain/PackageTable'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageStatus } from '../../components/ui/PageStatus'
import { PageHeader, Section } from '../../components/ui/Section'
import { useNow } from '../../data/hooks'
import { pageStatus, useActiveWork, useDirectory } from '../../data/queries'
import { reviewQueue } from '../../data/selectors'
import { buttonClasses, cx } from '../../lib/styles'
import { useSession } from '../../session/context'

export function ReviewQueue() {
  const now = useNow()
  const { me } = useSession()
  const [params, setParams] = useSearchParams()
  const work = useActiveWork()
  const { lookup, queries } = useDirectory()
  const status = pageStatus(work, ...queries)
  if (status.pending || status.error) return <PageStatus {...status} />

  const scope = params.get('scope') === 'mine' ? 'mine' : 'all'
  const all = reviewQueue(work.data!, me.id)
  const items = scope === 'mine' ? all.filter((p) => p.responsibleManagerId === me.id) : all
  const mineCount = all.filter((p) => p.responsibleManagerId === me.id).length

  const tab = (value: 'all' | 'mine', label: string, count: number) => (
    <button
      type="button"
      aria-pressed={scope === value}
      onClick={() => setParams(value === 'all' ? {} : { scope: value })}
      className={cx(
        'min-h-9 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-180 ease-out',
        scope === value ? 'bg-surface text-fg shadow-xs ring-1 ring-border' : 'text-muted-fg hover:text-fg',
      )}
    >
      {label} <span className="ml-1 font-mono text-muted-fg">{count}</span>
    </button>
  )

  return (
    <>
      <PageHeader
        title="Review queue"
        description="Open a package to check its review and delivery links, then approve it or mark Apply Feedback. Detailed comments stay in Frame.io."
      />
      <Section
        title="Submitted packages"
        description="Your packages first, then oldest submission first"
        flush
        actions={
          <div className="flex gap-1 rounded-lg bg-surface-2 p-1" role="group" aria-label="Filter queue">
            {tab('all', 'All', all.length)}
            {tab('mine', 'I’m responsible', mineCount)}
          </div>
        }
      >
        {items.length ? (
          <PackageTable
            lookup={lookup}
            packages={items}
            now={now}
            caption="Submitted packages awaiting review"
            columns={['package', 'product', 'editor', 'manager', 'round', 'submitted', 'deadline']}
            action={(pkg) => (
              <Link to={`/packages/${pkg.id}`} className={buttonClasses('primary', 'sm')}>
                Review
              </Link>
            )}
          />
        ) : (
          <EmptyState icon={Hourglass} title={scope === 'mine' ? 'Nothing waiting on you' : 'Nothing to review'}>
            When an editor submits links, the package appears here and the responsible manager is notified.
          </EmptyState>
        )}
      </Section>
    </>
  )
}
