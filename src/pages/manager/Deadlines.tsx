import { CalendarCheck, CalendarClock, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { PackageList } from '../../components/domain/PackageList'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageStatus } from '../../components/ui/PageStatus'
import { PageHeader, Section } from '../../components/ui/Section'
import { useNow } from '../../data/hooks'
import { pageStatus, useActiveWork, useDirectory } from '../../data/queries'
import { byDeadline, isActive, isDueWithin, isOverdue, type Lookup } from '../../data/selectors'
import type { PackageSummary } from '../../data/types'
import { cx } from '../../lib/styles'
import { DAY_MS, HOUR_MS } from '../../lib/time'
import { useSession } from '../../session/context'

/** Active packages grouped by urgency: overdue, due within 48 hours, due later this week. */
function deadlineGroups(packages: PackageSummary[], now: Date, managerId?: string) {
  const active = packages.filter((p) => isActive(p) && (!managerId || p.responsibleManagerId === managerId)).sort(byDeadline)
  return {
    overdue: active.filter((p) => isOverdue(p, now)),
    soon: active.filter((p) => isDueWithin(p, now, 48 * HOUR_MS)),
    week: active.filter((p) => isDueWithin(p, now, 7 * DAY_MS) && !isDueWithin(p, now, 48 * HOUR_MS)),
  }
}

export function Deadlines() {
  const now = useNow()
  const { me } = useSession()
  const [params, setParams] = useSearchParams()
  const work = useActiveWork()
  const { lookup, queries } = useDirectory()
  const status = pageStatus(work, ...queries)
  if (status.pending || status.error) return <PageStatus {...status} />

  const scope = params.get('scope') === 'mine' ? 'mine' : 'all'
  const groups = deadlineGroups(work.data!, now, scope === 'mine' ? me.id : undefined)
  const total = groups.overdue.length + groups.soon.length + groups.week.length

  const tab = (value: 'all' | 'mine', label: string) => (
    <button
      type="button"
      aria-pressed={scope === value}
      onClick={() => setParams(value === 'all' ? {} : { scope: value }, { replace: true })}
      className={cx(
        'min-h-10 rounded-md px-4 text-sm font-semibold transition-colors duration-150',
        scope === value ? 'bg-primary text-on-primary' : 'text-muted-fg hover:bg-surface-2 hover:text-fg',
      )}
    >
      {label}
    </button>
  )

  return (
    <>
      <PageHeader
        title="Deadlines"
        description="Active packages that are overdue or due in the next 7 days, soonest first. Times are in Manila (PHT)."
        actions={
          <div className="flex gap-1 rounded-lg border border-border bg-surface p-1" role="group" aria-label="Whose packages">
            {tab('all', 'All packages')}
            {tab('mine', 'I’m responsible')}
          </div>
        }
      />

      {total === 0 ? (
        <Section title="Nothing due this week">
          <EmptyState icon={CalendarCheck} title="No overdue or upcoming deadlines">
            {scope === 'mine' ? 'None of your packages are due in the next 7 days.' : 'No active package is due in the next 7 days.'}
          </EmptyState>
        </Section>
      ) : (
        <div className="flex flex-col gap-6">
          <Group
            title="Overdue"
            icon={TriangleAlert}
            tone="danger"
            description="Past the final deadline and still active"
            packages={groups.overdue}
            empty="Nothing is overdue."
            lookup={lookup}
            now={now}
          />
          <Group
            title="Due in the next 48 hours"
            icon={CalendarClock}
            tone="warning"
            description="Check in with the editor if work hasn’t been submitted"
            packages={groups.soon}
            empty="Nothing is due in the next 48 hours."
            lookup={lookup}
            now={now}
          />
          <Group
            title="Later this week"
            icon={CalendarCheck}
            description="Due in 2 to 7 days"
            packages={groups.week}
            empty="Nothing else is due this week."
            lookup={lookup}
            now={now}
          />
        </div>
      )}
    </>
  )
}

interface GroupProps {
  title: string
  icon: LucideIcon
  tone?: 'danger' | 'warning'
  description: string
  packages: PackageSummary[]
  empty: string
  lookup: Lookup
  now: Date
}

function Group({ title, icon: Icon, tone, description, packages, empty, lookup, now }: GroupProps) {
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return (
    <section aria-labelledby={`dl-${id}`} className="rounded-lg border border-border bg-surface">
      <header className="flex items-center gap-3 border-b border-border px-5 py-4">
        <span
          className={cx(
            'flex size-9 shrink-0 items-center justify-center rounded-md',
            tone === 'danger' && packages.length ? 'bg-danger-bg text-danger' : tone === 'warning' && packages.length ? 'bg-warning-bg text-warning' : 'bg-surface-2 text-muted-fg',
          )}
        >
          <Icon aria-hidden className="size-4" />
        </span>
        <div>
          <h2 id={`dl-${id}`} className="text-base font-semibold">
            {title} <span className="text-muted-fg tabular-nums">({packages.length})</span>
          </h2>
          <p className="text-sm text-muted-fg">{description}</p>
        </div>
      </header>
      {packages.length ? (
        <PackageList lookup={lookup} packages={packages} now={now} label={title} />
      ) : (
        <p className="px-5 py-4 text-sm text-muted-fg">{empty}</p>
      )}
    </section>
  )
}
