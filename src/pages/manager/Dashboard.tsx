import { CalendarClock, ChevronRight, Hourglass, Inbox, Pause, Play, RotateCcw, Send, TriangleAlert, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { KpiStat } from '../../components/domain/KpiStat'
import { PackageList } from '../../components/domain/PackageList'
import { ReviewDialog } from '../../components/domain/ReviewDialog'
import { Dialog } from '../../components/ui/Dialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageStatus } from '../../components/ui/PageStatus'
import { PageHeader, Section } from '../../components/ui/Section'
import { useNow } from '../../data/hooks'
import { pageStatus, useActiveWork, useDirectory } from '../../data/queries'
import { editorWorkload, isActive, isDueWithin, isOverdue, reviewQueue } from '../../data/selectors'
import type { PackageSummary } from '../../data/types'
import { buttonClasses } from '../../lib/styles'
import { formatDate, formatDistance, HOUR_MS } from '../../lib/time'
import { useSession } from '../../session/context'

/** How many rows a dashboard list shows before pointing to the full page. */
const PREVIEW_ROWS = 5

type Drill = 'review' | 'client' | 'overdue' | 'due48' | 'active'

export function ManagerDashboard() {
  const now = useNow()
  const { me } = useSession()
  const work = useActiveWork()
  const { people, lookup, queries } = useDirectory()
  const [drill, setDrill] = useState<Drill | null>(null)
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [editorId, setEditorId] = useState<string | null>(null)

  // The header needs no data, so it shows right away; the rest waits for its queries.
  const header = (
    <PageHeader
      title={`Hi, ${me.name.split(' ')[0]}`}
      description={`${formatDate(now.toISOString())} · Here’s what needs your attention.`}
      actions={
        <Link to="/packages/new" className={buttonClasses('primary')}>
          New package
        </Link>
      }
    />
  )
  const status = pageStatus(work, ...queries)
  if (status.pending || status.error)
    return (
      <>
        {header}
        <PageStatus {...status} />
      </>
    )

  // Current work is loaded completely, so every number below covers all of it.
  const active = work.data!.filter(isActive)
  const queue = reviewQueue(active, me.id)
  const mineInQueue = queue.filter((p) => p.responsibleManagerId === me.id).length
  const overdue = active.filter((p) => isOverdue(p, now))
  const due48 = active.filter((p) => isDueWithin(p, now, 48 * HOUR_MS))
  // Approved internally and waiting on the client's decision, longest waiting first.
  const withClient = work
    .data!.filter((p) => p.status === 'client_review')
    .sort((a, b) => (a.latest?.submittedAt ?? '').localeCompare(b.latest?.submittedAt ?? ''))
  const workload = editorWorkload(people, work.data!, now)
  const maxLoad = Math.max(1, ...workload.map((w) => w.active))
  const busyEditors = workload.filter((w) => w.active > 0).length

  const drills: Record<Drill, { title: string; description: string; packages: PackageSummary[]; to: string; linkLabel: string }> = {
    review: {
      title: 'Awaiting review',
      description: 'Submitted packages, yours first. Open one to approve it or mark Apply Feedback.',
      packages: queue,
      to: '/review',
      linkLabel: 'Open review queue',
    },
    client: {
      title: 'With the client',
      description: 'Approved internally and waiting on the client’s decision. Open one to record what the client said.',
      packages: withClient,
      to: '/packages?status=client_review',
      linkLabel: 'Open in Packages',
    },
    overdue: {
      title: 'Overdue',
      description: 'Active packages past their final deadline.',
      packages: overdue,
      to: '/deadlines',
      linkLabel: 'Open deadlines',
    },
    due48: {
      title: 'Due in the next 48 hours',
      description: 'Active packages due soon, soonest first.',
      packages: due48,
      to: '/deadlines',
      linkLabel: 'Open deadlines',
    },
    active: {
      title: 'Active packages',
      description: 'Assigned, in progress, submitted, or needing changes, soonest deadline first.',
      packages: active,
      to: '/packages?status=active',
      linkLabel: 'Open in Packages',
    },
  }
  const openDrill = drill ? drills[drill] : null
  const reviewing = reviewId ? (queue.find((p) => p.id === reviewId) ?? null) : null
  const editorLoad = editorId ? workload.find((w) => w.editor.id === editorId) : undefined

  return (
    <>
      {header}

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-5">
        <KpiStat
          label="Awaiting review"
          value={queue.length}
          hint={mineInQueue ? `${mineInQueue} where you’re responsible` : 'Any manager can review'}
          icon={Inbox}
          tone="attention"
          onClick={() => setDrill('review')}
        />
        <KpiStat
          label="With the client"
          value={withClient.length}
          hint={withClient.length ? 'Waiting on their decision' : 'Nothing waiting on clients'}
          icon={Send}
          onClick={() => setDrill('client')}
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
          label="Due in 48 hours"
          value={due48.length}
          hint="Active work due soon"
          icon={CalendarClock}
          tone="attention"
          onClick={() => setDrill('due48')}
        />
        <KpiStat
          label="Active packages"
          value={active.length}
          hint={`Across ${busyEditors} ${busyEditors === 1 ? 'editor' : 'editors'}`}
          icon={Play}
          onClick={() => setDrill('active')}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5 lg:items-start">
        <Section
          title="Needs your review"
          description="Yours first, then the oldest submission"
          className="lg:col-span-3"
          flush
          actions={
            <Link to="/review" className="text-sm font-semibold text-primary hover:underline">
              Review queue
            </Link>
          }
        >
          {queue.length ? (
            <>
              <ul className="divide-y divide-border" aria-label="Packages awaiting review">
                {queue.slice(0, PREVIEW_ROWS).map((pkg) => {
                  const submittedAt = pkg.latest?.submittedAt
                  return (
                    <li key={pkg.id} className="flex items-center justify-between gap-4 px-5 py-4">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{pkg.title}</span>
                          {pkg.responsibleManagerId === me.id && (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Yours</span>
                          )}
                        </p>
                        <p className="mt-0.5 text-sm text-muted-fg tabular-nums">
                          {lookup.personName(pkg.editorId)} · Round {pkg.latest?.round ?? 1}
                          {submittedAt && ` · ${formatDistance(now.getTime() - new Date(submittedAt).getTime())} ago`}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        className={buttonClasses('primary', 'sm', 'shrink-0')}
                        onClick={() => setReviewId(pkg.id)}
                      >
                        Review
                        <span className="sr-only"> {pkg.title}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              {queue.length > PREVIEW_ROWS && (
                <Link
                  to="/review"
                  className="block border-t border-border px-5 py-3 text-sm font-semibold text-primary hover:bg-surface-2"
                >
                  View all {queue.length} in the review queue
                </Link>
              )}
            </>
          ) : (
            <EmptyState icon={Hourglass} title="Nothing to review">
              Submitted packages will show up here.
            </EmptyState>
          )}
        </Section>

        <Section title="Team workload" description="Active packages per editor. Select one for details." className="lg:col-span-2" flush>
          {workload.length ? (
            <ul className="divide-y divide-border">
              {workload.map((w) => (
                <li key={w.editor.id}>
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => setEditorId(w.editor.id)}
                    className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors duration-150 hover:bg-surface-2"
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
                      {(w.overdue > 0 || w.needsChanges > 0 || w.onHold > 0) && (
                        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold tabular-nums">
                          {w.overdue > 0 && (
                            <span className="inline-flex items-center gap-1 text-danger">
                              <TriangleAlert aria-hidden className="size-3.5" />
                              {w.overdue} overdue
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
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Users} title="No editors yet" compact />
          )}
        </Section>
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
                {openDrill.linkLabel}
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

      <Dialog
        open={Boolean(editorLoad)}
        onClose={() => setEditorId(null)}
        title={editorLoad?.editor.name ?? ''}
        description={editorLoad && `${editorLoad.editor.title} · ${editorLoad.active} active ${editorLoad.active === 1 ? 'package' : 'packages'}`}
        footer={
          editorLoad && (
            <>
              <button type="button" className={buttonClasses('secondary')} onClick={() => setEditorId(null)}>
                Close
              </button>
              <Link to={`/packages?editor=${editorLoad.editor.id}&status=active`} className={buttonClasses('primary')}>
                Open in Packages
              </Link>
            </>
          )
        }
      >
        {editorLoad &&
          (editorLoad.active ? (
            <div className="-mx-5 border-y border-border">
              <PackageList
                lookup={lookup}
                packages={active.filter((p) => p.editorId === editorLoad.editor.id)}
                now={now}
                label={`${editorLoad.editor.name}’s active packages`}
                hideEditor
              />
            </div>
          ) : (
            <EmptyState icon={Play} title="No active packages" compact>
              {editorLoad.editor.name.split(' ')[0]} is free for a new assignment.
            </EmptyState>
          ))}
      </Dialog>

      <ReviewDialog lookup={lookup} pkg={reviewing} now={now} onClose={() => setReviewId(null)} />
    </>
  )
}
