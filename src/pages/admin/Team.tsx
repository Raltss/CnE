import { Users } from 'lucide-react'
import { useId } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AccessBadge } from '../../components/domain/StatusBadge'
import { ViewOnlyBanner } from '../../components/domain/ViewOnlyBanner'
import { EmptyState } from '../../components/ui/EmptyState'
import { FilterSelect } from '../../components/ui/FilterSelect'
import { PageHeader, Section } from '../../components/ui/Section'
import { TabNav } from '../../components/ui/TabNav'
import { useAppState, useNow } from '../../data/hooks'
import { decisionsBy, isActive, isOverdue } from '../../data/selectors'
import type { AppState, Person } from '../../data/types'
import { openSession } from '../../data/workflow'
import { cx } from '../../lib/styles'
import { DAY_MS, formatTime } from '../../lib/time'

type TeamRole = 'editor' | 'manager'

interface Column {
  head: string
  value: (person: Person) => number
  /** Highlight non-zero values (e.g. overdue). */
  alert?: boolean
}

const within30Days = (iso: string | null, now: Date) => Boolean(iso) && now.getTime() - new Date(iso!).getTime() <= 30 * DAY_MS

function columnsFor(role: TeamRole, state: AppState, now: Date): Column[] {
  const held = (p: Person) => state.packages.filter((pkg) => (role === 'editor' ? pkg.editorId : pkg.responsibleManagerId) === p.id)
  const active = (p: Person) => held(p).filter(isActive)
  const common: Column[] = [
    { head: 'Awaiting review', value: (p) => active(p).filter((pkg) => pkg.status === 'submitted').length },
    { head: 'Overdue', value: (p) => active(p).filter((pkg) => isOverdue(pkg, now)).length, alert: true },
  ]
  if (role === 'editor')
    return [
      { head: 'Active', value: (p) => active(p).length },
      ...common,
      { head: 'Needs changes', value: (p) => active(p).filter((pkg) => pkg.status === 'apply_feedback').length },
      { head: 'Completed (30 days)', value: (p) => held(p).filter((pkg) => pkg.status === 'completed' && within30Days(pkg.completedAt, now)).length },
    ]
  return [
    { head: 'Responsible (active)', value: (p) => active(p).length },
    ...common,
    { head: 'Decisions (30 days)', value: (p) => decisionsBy(state, p.id).filter((d) => within30Days(d.decidedAt, now)).length },
  ]
}

function ClockStatus({ state, person }: { state: AppState; person: Person }) {
  const open = openSession(state, person.id)
  return open ? (
    <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap">
      <span aria-hidden className="size-2 rounded-full bg-success" />
      In since {formatTime(open.clockIn)}
    </span>
  ) : (
    <span className="text-sm text-muted-fg whitespace-nowrap">Not clocked in</span>
  )
}

/** Admin: every manager and editor, with a summary of their work. Rows open the person's detail page. */
export function Team() {
  const state = useAppState()
  const now = useNow()
  const uid = useId()
  const [params, setParams] = useSearchParams()
  const role: TeamRole = params.get('role') === 'manager' ? 'manager' : 'editor'
  const access = params.get('access') ?? 'active'

  const ofRole = state.people.filter((p) => p.role === role)
  const shown = ofRole
    .filter((p) => access === 'all' || (access === 'deactivated' ? !p.isActive : p.isActive))
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name))
  const columns = columnsFor(role, state, now)
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
          { id: 'editor', label: 'Editors', count: state.people.filter((p) => p.role === 'editor' && p.isActive).length },
          { id: 'manager', label: 'Managers', count: state.people.filter((p) => p.role === 'manager' && p.isActive).length },
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
            <table className="hidden w-full border-collapse text-left text-sm md:table">
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
                  <tr key={p.id} className="border-t border-border transition-colors duration-150 hover:bg-surface-2/60">
                    <td className="px-4 py-3">
                      <Link to={`/team/${p.id}`} className="font-semibold text-fg underline-offset-2 hover:text-primary hover:underline">
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
                      <ClockStatus state={state} person={p} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="divide-y divide-border md:hidden" aria-label={`${roleLabel} and their work`}>
              {shown.map((p) => (
                <li key={p.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <Link to={`/team/${p.id}`} className="font-semibold hover:text-primary hover:underline">
                        {p.name}
                      </Link>
                      <span className="block text-xs text-muted-fg">{p.title}</span>
                    </span>
                    {p.isActive ? <ClockStatus state={state} person={p} /> : <AccessBadge account={p} />}
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
