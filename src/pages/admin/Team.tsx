import { Users } from 'lucide-react'
import { useId } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AccessBadge } from '../../components/domain/StatusBadge'
import { ViewOnlyBanner } from '../../components/domain/ViewOnlyBanner'
import { EmptyState } from '../../components/ui/EmptyState'
import { FilterSelect } from '../../components/ui/FilterSelect'
import { PageStatus } from '../../components/ui/PageStatus'
import { PageHeader, Section } from '../../components/ui/Section'
import { TabNav } from '../../components/ui/TabNav'
import { useIsWide, useNow } from '../../data/hooks'
import { pageStatus, useActiveWork, useOpenSessions, usePeople, useRecentCompletions, useRecentDecisions } from '../../data/queries'
import { isActive, isOverdue } from '../../data/selectors'
import type { AttendanceSession, PackageSummary, Person } from '../../data/types'
import { cx } from '../../lib/styles'
import { formatTime } from '../../lib/time'

type TeamRole = 'editor' | 'manager'

interface Column {
  head: string
  value: (person: Person) => number
  /** Highlight non-zero values (e.g. overdue). */
  alert?: boolean
}

interface TeamData {
  /** Every current package (complete). */
  packages: PackageSummary[]
  /** One row per package completed in the last 30 days. */
  completions: Array<{ editorId: string }>
  /** One row per review decision in the last 30 days. */
  decisions: Array<{ decidedById: string }>
}

function columnsFor(role: TeamRole, data: TeamData, now: Date): Column[] {
  const active = (p: Person) => data.packages.filter((pkg) => (role === 'editor' ? pkg.editorId : pkg.responsibleManagerId) === p.id && isActive(pkg))
  const common: Column[] = [
    { head: 'Awaiting review', value: (p) => active(p).filter((pkg) => pkg.status === 'submitted').length },
    { head: 'Overdue', value: (p) => active(p).filter((pkg) => isOverdue(pkg, now)).length, alert: true },
  ]
  if (role === 'editor')
    return [
      { head: 'Active', value: (p) => active(p).length },
      ...common,
      { head: 'Needs changes', value: (p) => active(p).filter((pkg) => pkg.status === 'apply_feedback').length },
      { head: 'Completed (30 days)', value: (p) => data.completions.filter((c) => c.editorId === p.id).length },
    ]
  return [
    { head: 'Responsible (active)', value: (p) => active(p).length },
    ...common,
    { head: 'Decisions (30 days)', value: (p) => data.decisions.filter((d) => d.decidedById === p.id).length },
  ]
}

function ClockStatus({ open: sessions, person }: { open: AttendanceSession[]; person: Person }) {
  const open = sessions.find((s) => s.personId === person.id)
  return open ? (
    <span data-seenry-dot="presence" className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap">
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-success" />
      In since {formatTime(open.clockIn)}
    </span>
  ) : (
    <span className="text-sm text-muted-fg whitespace-nowrap">Not clocked in</span>
  )
}

/** Admin: every manager and editor, with a summary of their work. Rows open the person's detail page. */
export function Team() {
  const wide = useIsWide()
  const now = useNow()
  const uid = useId()
  const [params, setParams] = useSearchParams()
  const role: TeamRole = params.get('role') === 'manager' ? 'manager' : 'editor'
  const access = params.get('access') ?? 'active'
  const people = usePeople()
  const work = useActiveWork()
  const open = useOpenSessions()
  const completions = useRecentCompletions()
  const decisions = useRecentDecisions()
  const status = pageStatus(people, work, open, completions, decisions)
  if (status.pending || status.error) return <PageStatus {...status} />
  const everyone = people.data!

  const ofRole = everyone.filter((p) => p.role === role)
  const shown = ofRole
    .filter((p) => access === 'all' || (access === 'deactivated' ? !p.isActive : p.isActive))
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name))
  const columns = columnsFor(role, { packages: work.data!, completions: completions.data!, decisions: decisions.data! }, now)
  const roleLabel = role === 'editor' ? 'editors' : 'managers'

  const setAccess = (value: string) => {
    const next = new URLSearchParams(params)
    if (value && value !== 'active') next.set('access', value)
    else next.delete('access')
    setParams(next, { replace: true })
  }

  return (
    <>
      <PageHeader title="Team" description="Managers and editors, with a summary of their work. Select someone to see everything they’re working on." />
      <ViewOnlyBanner />
      <TabNav
        label="Choose a team"
        param="role"
        current={role}
        tabs={[
          { id: 'editor', label: 'Editors', count: everyone.filter((p) => p.role === 'editor' && p.isActive).length },
          { id: 'manager', label: 'Managers', count: everyone.filter((p) => p.role === 'manager' && p.isActive).length },
        ]}
      />

      <Section
        title={`${shown.length} ${shown.length === 1 ? roleLabel.slice(0, -1) : roleLabel}`}
        description={role === 'editor' ? 'Counts are packages currently assigned to each editor' : 'Counts are packages each manager is responsible for'}
        flush
        actions={
          <div className="w-44">
            <FilterSelect
              id={`${uid}-access`}
              label="Access"
              value={access}
              onChange={setAccess}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'deactivated', label: 'Deactivated' },
                { value: 'all', label: 'Everyone' },
              ]}
            />
          </div>
        }
      >
        {shown.length ? (
          <>
            {wide ? (
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">{`${roleLabel} and their work`}</caption>
                <thead className="bg-surface-2 text-xs font-semibold text-muted-fg">
                  <tr>
                    <th scope="col" className="px-4 py-2">Name</th>
                    {columns.map((c) => (
                      <th key={c.head} scope="col" className="px-4 py-2 text-right">
                        {c.head}
                      </th>
                    ))}
                    <th scope="col" className="px-4 py-2">Right now</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.id} className="border-t border-border transition-colors duration-120 hover:bg-surface-2/60">
                      <td className="px-4 py-3">
                        <Link to={`/team/${p.id}`} className="font-medium text-fg decoration-border-strong underline-offset-4 hover:underline">
                          {p.name}
                        </Link>
                        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-fg">
                          {p.title}
                          {!p.isActive && <AccessBadge account={p} />}
                        </span>
                      </td>
                      {columns.map((c) => {
                        const n = c.value(p)
                        return (
                          <td key={c.head} className={cx('px-4 py-3 text-right tabular-nums', c.alert && n > 0 && 'font-semibold text-danger')}>
                            {n}
                          </td>
                        )
                      })}
                      <td className="px-4 py-3">
                        <ClockStatus open={open.data!} person={p} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <ul className="divide-y divide-border" aria-label={`${roleLabel} and their work`}>
                {shown.map((p) => (
                  <li key={p.id} className="flex flex-col gap-2 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <Link to={`/team/${p.id}`} className="font-medium text-fg decoration-border-strong underline-offset-4 hover:underline">
                          {p.name}
                        </Link>
                        <span className="block text-xs text-muted-fg">{p.title}</span>
                      </span>
                      {p.isActive ? <ClockStatus open={open.data!} person={p} /> : <AccessBadge account={p} />}
                    </div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                      {columns.map((c) => (
                        <div key={c.head} className="flex justify-between gap-2">
                          <dt className="text-xs text-muted-fg">{c.head}</dt>
                          <dd className={cx('tabular-nums', c.alert && c.value(p) > 0 && 'font-semibold text-danger')}>{c.value(p)}</dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <EmptyState icon={Users} title={`No ${access === 'deactivated' ? 'deactivated ' : ''}${roleLabel}`} compact>
            Approve accounts and choose their roles in Staff &amp; Roles.
          </EmptyState>
        )}
      </Section>
    </>
  )
}
