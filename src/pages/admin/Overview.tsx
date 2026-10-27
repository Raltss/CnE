import { CalendarCheck, ChevronRight, Hourglass, Play, Timer, UserRoundCheck, Users } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { DeadlineTrack } from '../../components/domain/DeadlineTrack'
import { ViewOnlyBanner } from '../../components/domain/ViewOnlyBanner'
import { WorkloadList } from '../../components/domain/WorkloadList'
import { Callout } from '../../components/ui/Callout'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageStatus } from '../../components/ui/PageStatus'
import { PageHeader, Section } from '../../components/ui/Section'
import { Segmented } from '../../components/ui/Segmented'
import { useNow } from '../../data/hooks'
import { pageStatus, useAccounts, useActiveWork, useDirectory, useOpenSessions, useRecentDecisions } from '../../data/queries'
import { accessOf, byDeadline, editorWorkload, isActive, isDueWithin, isOverdue, managerLoad, reviewQueue, sessionDurationMs } from '../../data/selectors'
import type { PackageSummary } from '../../data/types'
import { cardClasses, cx, linkClasses } from '../../lib/styles'
import { formatDate, formatDuration, formatTime, HOUR_MS } from '../../lib/time'

type View = 'late' | 'review' | 'due48' | 'active'
const VIEWS: View[] = ['late', 'review', 'due48', 'active']

const EMPTY: Record<View, { icon: typeof Play; title: string; body: string }> = {
  late: { icon: CalendarCheck, title: 'Nothing is overdue', body: 'Every active package is ahead of its deadline.' },
  review: { icon: Hourglass, title: 'No reviews waiting', body: 'Submitted rounds wait here until a manager decides.' },
  due48: { icon: CalendarCheck, title: 'Nothing due in the next 48 hours', body: 'Later deadlines are on the Calendar.' },
  active: { icon: Play, title: 'No active packages', body: 'Managers create and assign packages.' },
}

/** Admin home: the whole team's work at a glance. Read-only; rows lead to packages and person pages. */
export function AdminOverview() {
  const now = useNow()
  const [params] = useSearchParams()
  const work = useActiveWork()
  const open = useOpenSessions()
  const decisions = useRecentDecisions()
  const accounts = useAccounts()
  const { people, lookup, queries } = useDirectory()
  // The header needs no data, so it shows right away; the rest waits for its queries.
  const header = (
    <>
      <PageHeader title="Team overview" description={`${formatDate(now.toISOString())} · Everyone’s work at a glance`} />
      <ViewOnlyBanner />
    </>
  )
  const status = pageStatus(work, open, decisions, accounts, ...queries)
  if (status.pending || status.error)
    return (
      <>
        {header}
        <PageStatus {...status} />
      </>
    )

  // Current work is loaded completely, so these totals cover all of it.
  const active = work.data!.filter(isActive)
  const late = active.filter((p) => isOverdue(p, now)).sort(byDeadline)
  // No manager is "first" for an admin, so the queue is simply oldest submission first.
  const pending = reviewQueue(active, '')
  const due48 = active.filter((p) => isDueWithin(p, now, 48 * HOUR_MS)).sort(byDeadline)
  const clockedIn = open.data!
  const workload = editorWorkload(people, work.data!, now)
  const managersLoad = managerLoad(people, active, decisions.data!, now)
  const waiting = accounts.data!.filter((a) => accessOf(a) === 'pending').length

  const rows: Record<View, PackageSummary[]> = { late, review: pending, due48, active: [...active].sort(byDeadline) }
  const requested = params.get('view') as View | null
  const view: View = requested && VIEWS.includes(requested) ? requested : late.length ? 'late' : 'active'
  const list = rows[view]
  const empty = EMPTY[view]

  return (
    <>
      {header}
      {waiting > 0 && (
        <div className="mb-6">
          <Callout tone="warning" title={`${waiting} ${waiting === 1 ? 'account is' : 'accounts are'} waiting for approval`}>
            <Link to="/staff?access=pending" className={linkClasses}>
              Review in Staff &amp; Roles
            </Link>
          </Callout>
        </div>
      )}

      <section aria-labelledby="overview-track" className={cx(cardClasses, 'overflow-hidden max-md:-mx-4 max-md:rounded-none max-md:border-y max-md:border-border max-md:ring-0')}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-5">
          <h2 id="overview-track" className="sr-only">
            Current work
          </h2>
          <Segmented
            label="Current work"
            param="view"
            current={view}
            items={[
              { id: 'late', label: 'Overdue', count: late.length, late: true },
              { id: 'review', label: 'Waiting for review', count: pending.length },
              { id: 'due48', label: 'Due in 48h', count: due48.length },
              { id: 'active', label: 'All active', count: active.length },
            ]}
          />
          <Link to="/packages?status=active" className={cx(linkClasses, 'text-sm')}>
            Open Packages
          </Link>
        </div>
        {list.length ? (
          <DeadlineTrack packages={list} now={now} lookup={lookup} label={`Current work: ${view}`} />
        ) : (
          <div className="border-t border-border">
            <EmptyState icon={empty.icon} title={empty.title}>
              {empty.body}
            </EmptyState>
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-5 xl:items-start">
        <Section
          title="Editor workload"
          description="Active packages per editor. Select one to see their work."
          className="xl:col-span-3"
          flush
          actions={
            <Link to="/team?role=editor" className={cx(linkClasses, 'text-sm')}>
              All editors
            </Link>
          }
        >
          {workload.length ? (
            <div className="border-t border-border">
              <WorkloadList workload={workload} to={(id) => `/team/${id}`} />
            </div>
          ) : (
            <EmptyState icon={Users} title="No active editors yet" compact>
              Approve editor accounts in Staff &amp; Roles.
            </EmptyState>
          )}
        </Section>

        <div className="flex min-w-0 flex-col gap-6 xl:col-span-2">
          <Section
            title="Clocked in now"
            description={`${clockedIn.length} of ${workload.length + managersLoad.length} people`}
            flush
            actions={
              <Link to="/attendance" className={cx(linkClasses, 'text-sm')}>
                Attendance
              </Link>
            }
          >
            {clockedIn.length ? (
              <ul className="divide-y divide-border border-t border-border">
                {clockedIn.map((s) => (
                  <li key={s.id}>
                    <Link
                      to={`/team/${s.personId}?tab=attendance`}
                      className="flex items-center justify-between gap-3 px-5 py-3 text-ui transition-colors duration-120 hover:bg-surface-2/60"
                    >
                      <span data-seenry-dot="presence" className="flex min-w-0 items-center gap-2.5">
                        <span aria-hidden className="size-2 shrink-0 rounded-full bg-success" />
                        <span className="truncate font-medium">{lookup.personName(s.personId)}</span>
                      </span>
                      <span className="shrink-0 text-sm text-muted-fg">
                        since {formatTime(s.clockIn)} · <span className="text-fg tabular-nums">{formatDuration(sessionDurationMs(s, now))}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={Timer} title="Nobody is clocked in" compact>
                Sessions appear here as people clock in.
              </EmptyState>
            )}
          </Section>

          <Section
            title="Managers"
            description="Reviews waiting on each responsible manager"
            flush
            actions={
              <Link to="/team?role=manager" className={cx(linkClasses, 'text-sm')}>
                All managers
              </Link>
            }
          >
            {managersLoad.length ? (
              <ul className="divide-y divide-border border-t border-border">
                {managersLoad.map((m) => (
                  <li key={m.manager.id}>
                    <Link to={`/team/${m.manager.id}`} className="group flex items-center gap-3 px-5 py-3.5 transition-colors duration-120 hover:bg-surface-2/60">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{m.manager.name}</span>
                        <span className="mt-0.5 block text-sm text-muted-fg">
                          <span className="text-fg tabular-nums">{m.awaitingReview}</span> waiting for review · <span className="text-fg tabular-nums">{m.responsible}</span>{' '}
                          active
                          {m.overdue > 0 && <span className="font-medium text-now"> · {m.overdue} overdue</span>}
                        </span>
                      </span>
                      <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-fg transition-transform duration-120 group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={UserRoundCheck} title="No active managers yet" compact>
                Approve manager accounts in Staff &amp; Roles.
              </EmptyState>
            )}
          </Section>
        </div>
      </div>
    </>
  )
}
