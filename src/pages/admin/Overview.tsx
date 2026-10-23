import { ChevronRight, Inbox, Pause, Play, RotateCcw, Timer, TriangleAlert, UserRoundCheck, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { KpiStat } from '../../components/domain/KpiStat'
import { PackageList } from '../../components/domain/PackageList'
import { ViewOnlyBanner } from '../../components/domain/ViewOnlyBanner'
import { Callout } from '../../components/ui/Callout'
import { Dialog } from '../../components/ui/Dialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageStatus } from '../../components/ui/PageStatus'
import { PageHeader, Section } from '../../components/ui/Section'
import { useNow } from '../../data/hooks'
import { pageStatus, useAccounts, useActiveWork, useDirectory, useOpenSessions, useRecentDecisions } from '../../data/queries'
import { accessOf, editorWorkload, isActive, isOverdue, managerLoad, reviewQueue, sessionDurationMs } from '../../data/selectors'
import type { PackageSummary } from '../../data/types'
import { buttonClasses } from '../../lib/styles'
import { formatDate, formatDuration, formatTime } from '../../lib/time'

type Drill = 'active' | 'overdue' | 'review'

/** Admin home: the whole team's work at a glance. Read-only; drill-downs open dialogs or person pages. */
export function AdminOverview() {
  const now = useNow()
  const [drill, setDrill] = useState<Drill | null>(null)
  const work = useActiveWork()
  const open = useOpenSessions()
  const decisions = useRecentDecisions()
  const accounts = useAccounts()
  const { people, lookup, queries } = useDirectory()
  // The header needs no data, so it shows right away; the rest waits for its queries.
  const header = (
    <>
      <PageHeader title="Team overview" description={`${formatDate(now.toISOString())} · Everyone’s work at a glance.`} />
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
  const overdue = active.filter((p) => isOverdue(p, now))
  // No manager is "first" for an admin, so the queue is simply oldest submission first.
  const pending = reviewQueue(active, '')
  const clockedIn = open.data!
  const workload = editorWorkload(people, work.data!, now)
  const maxLoad = Math.max(1, ...workload.map((w) => w.active))
  const managersLoad = managerLoad(people, active, decisions.data!, now)
  const waiting = accounts.data!.filter((a) => accessOf(a) === 'pending').length
  const busyEditors = workload.filter((w) => w.active > 0).length

  const drills: Record<Drill, { title: string; description: string; packages: PackageSummary[]; to: string }> = {
    active: {
      title: 'Active packages',
      description: 'Assigned, in progress, submitted, or needing changes, soonest deadline first.',
      packages: active,
      to: '/packages?status=active',
    },
    overdue: { title: 'Overdue', description: 'Active packages past their final deadline.', packages: overdue, to: '/packages?due=overdue' },
    review: {
      title: 'Pending reviews',
      description: 'Submitted and waiting for a manager, oldest submission first.',
      packages: pending,
      to: '/packages?status=submitted',
    },
  }
  const openDrill = drill ? drills[drill] : null

  return (
    <>
      {header}
      {waiting > 0 && (
        <div className="mb-6">
          <Callout tone="warning" title={`${waiting} ${waiting === 1 ? 'account is' : 'accounts are'} waiting for approval`}>
            <Link to="/staff?access=pending" className="font-semibold text-primary underline-offset-2 hover:underline">
              Review in Staff &amp; Roles
            </Link>
          </Callout>
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiStat
          label="Active packages"
          value={active.length}
          hint={`Across ${busyEditors} ${busyEditors === 1 ? 'editor' : 'editors'}`}
          icon={Play}
          onClick={() => setDrill('active')}
        />
        <KpiStat
          label="Overdue"
          value={overdue.length}
          hint={overdue.length ? 'Past the final deadline' : 'Everything is on time'}
          icon={TriangleAlert}
          tone="danger"
          onClick={() => setDrill('overdue')}
        />
        <KpiStat
          label="Pending reviews"
          value={pending.length}
          hint="Waiting for a manager"
          icon={Inbox}
          tone="attention"
          onClick={() => setDrill('review')}
        />
        <KpiStat
          label="Clocked in now"
          value={clockedIn.length}
          hint="Open team attendance"
          icon={Timer}
          to="/attendance"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5 lg:items-start">
        <Section
          title="Editor workload"
          description="Active packages per editor. Select one to see their work."
          className="lg:col-span-3"
          flush
          actions={
            <Link to="/team?role=editor" className="text-sm font-semibold text-primary hover:underline">
              All editors
            </Link>
          }
        >
          {workload.length ? (
            <ul className="divide-y divide-border">
              {workload.map((w) => (
                <li key={w.editor.id}>
                  <Link
                    to={`/team/${w.editor.id}`}
                    className="flex w-full items-center gap-3 px-5 py-3.5 transition-colors duration-150 hover:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-semibold">{w.editor.name}</span>
                        <span className="tabular-nums">
                          <span className="font-bold">{w.active}</span> active
                        </span>
                      </span>
                      <span aria-hidden className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${(w.active / maxLoad) * 100}%` }} />
                      </span>
                      {(w.overdue > 0 || w.needsChanges > 0 || w.awaitingReview > 0 || w.onHold > 0) && (
                        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold tabular-nums">
                          {w.overdue > 0 && (
                            <span className="inline-flex items-center gap-1 text-danger">
                              <TriangleAlert aria-hidden className="size-3.5" />
                              {w.overdue} overdue
                            </span>
                          )}
                          {w.awaitingReview > 0 && (
                            <span className="inline-flex items-center gap-1 text-st-submitted">
                              <Inbox aria-hidden className="size-3.5" />
                              {w.awaitingReview} awaiting review
                            </span>
                          )}
                          {w.needsChanges > 0 && (
                            <span className="inline-flex items-center gap-1 text-st-feedback">
                              <RotateCcw aria-hidden className="size-3.5" />
                              {w.needsChanges} needs changes
                            </span>
                          )}
                          {w.onHold > 0 && (
                            <span className="inline-flex items-center gap-1 text-st-hold">
                              <Pause aria-hidden className="size-3.5" />
                              {w.onHold} on hold
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-fg" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Users} title="No active editors yet" compact>
              Approve editor accounts in Staff &amp; Roles.
            </EmptyState>
          )}
        </Section>

        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Section
            title={`Clocked in now (${clockedIn.length})`}
            flush
            actions={
              <Link to="/attendance" className="text-sm font-semibold text-primary hover:underline">
                Attendance
              </Link>
            }
          >
            {clockedIn.length ? (
              <ul className="divide-y divide-border">
                {clockedIn.map((s) => (
                  <li key={s.id}>
                    <Link
                      to={`/team/${s.personId}?tab=attendance`}
                      className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm tabular-nums transition-colors duration-150 hover:bg-surface-2"
                    >
                      <span className="flex min-w-0 items-center gap-2 font-semibold">
                        <span aria-hidden className="size-2 shrink-0 rounded-full bg-success" />
                        <span className="truncate">{lookup.personName(s.personId)}</span>
                      </span>
                      <span className="shrink-0 text-muted-fg">
                        since {formatTime(s.clockIn)} · {formatDuration(sessionDurationMs(s, now))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={Timer} title="Nobody is clocked in" compact />
            )}
          </Section>

          <Section
            title="Managers"
            description="Reviews waiting on each responsible manager"
            flush
            actions={
              <Link to="/team?role=manager" className="text-sm font-semibold text-primary hover:underline">
                All managers
              </Link>
            }
          >
            {managersLoad.length ? (
              <ul className="divide-y divide-border">
                {managersLoad.map((m) => (
                  <li key={m.manager.id}>
                    <Link
                      to={`/team/${m.manager.id}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="font-semibold">{m.manager.name}</span>
                        <span className="mt-0.5 block text-xs text-muted-fg tabular-nums">
                          {m.awaitingReview} awaiting review · {m.responsible} active responsible
                          {m.overdue > 0 && <span className="font-semibold text-danger"> · {m.overdue} overdue</span>}
                        </span>
                      </span>
                      <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-fg" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={UserRoundCheck} title="No active managers yet" compact />
            )}
          </Section>
        </div>
      </div>

      <Dialog
        open={Boolean(openDrill)}
        onClose={() => setDrill(null)}
        title={openDrill ? `${openDrill.title} (${openDrill.packages.length})` : ''}
        description={openDrill?.description}
        footer={
          openDrill && (
            <>
              <button type="button" className={buttonClasses('secondary')} onClick={() => setDrill(null)}>
                Close
              </button>
              <Link to={openDrill.to} className={buttonClasses('primary')}>
                Open in Packages
              </Link>
            </>
          )
        }
      >
        {openDrill &&
          (openDrill.packages.length ? (
            <div className="-mx-5 border-y border-border">
              <PackageList lookup={lookup} packages={openDrill.packages} now={now} label={openDrill.title} />
            </div>
          ) : (
            <EmptyState icon={Inbox} title="Nothing here right now" compact />
          ))}
      </Dialog>
    </>
  )
}
