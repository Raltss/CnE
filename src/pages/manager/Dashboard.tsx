import { CalendarCheck, Hourglass, Inbox, Play, Plus, Send, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { DeadlineTrack } from '../../components/domain/DeadlineTrack'
import { PackageList } from '../../components/domain/PackageList'
import { ReviewDialog } from '../../components/domain/ReviewDialog'
import { WorkloadList } from '../../components/domain/WorkloadList'
import { Dialog } from '../../components/ui/Dialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageStatus } from '../../components/ui/PageStatus'
import { PageHeader, Section } from '../../components/ui/Section'
import { Segmented } from '../../components/ui/Segmented'
import { useNow } from '../../data/hooks'
import { pageStatus, useActiveWork, useDirectory } from '../../data/queries'
import { byDeadline, editorWorkload, isActive, isDueWithin, isOverdue, reviewQueue } from '../../data/selectors'
import type { PackageSummary } from '../../data/types'
import { buttonClasses, cardClasses, cx, linkClasses } from '../../lib/styles'
import { formatDate, formatDistance, HOUR_MS } from '../../lib/time'
import { useSession } from '../../session/context'

type View = 'review' | 'client' | 'late' | 'due48' | 'active'
const VIEWS: View[] = ['review', 'client', 'late', 'due48', 'active']

const EMPTY: Record<View, { icon: typeof Inbox; title: string; body: string }> = {
  review: { icon: Hourglass, title: 'Nothing to review', body: 'Submitted rounds show up here, yours first.' },
  client: { icon: Send, title: 'Nothing with clients', body: 'Rounds you approve and send to the client wait here for their decision.' },
  late: { icon: CalendarCheck, title: 'Nothing is overdue', body: 'Every active package is ahead of its deadline.' },
  due48: { icon: CalendarCheck, title: 'Nothing due in the next 48 hours', body: 'Upcoming deadlines are on the Deadlines page.' },
  active: { icon: Play, title: 'No active packages', body: 'Create a package to assign work to an editor.' },
}

export function ManagerDashboard() {
  const now = useNow()
  const { me } = useSession()
  const work = useActiveWork()
  const { people, lookup, queries } = useDirectory()
  const [params] = useSearchParams()
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [editorId, setEditorId] = useState<string | null>(null)

  const status = pageStatus(work, ...queries)
  const header = (waiting?: number) => (
    <PageHeader
      title="Dashboard"
      description={
        <>
          {formatDate(now.toISOString())}
          {waiting !== undefined && <> · {waiting ? `${waiting} waiting for review` : 'nothing waiting for review'}</>}
        </>
      }
      actions={
        <Link to="/packages/new" className={buttonClasses('primary')}>
          <Plus aria-hidden />
          New package
        </Link>
      }
    />
  )
  // The header needs no data, so it shows right away; the rest waits for its queries.
  if (status.pending || status.error)
    return (
      <>
        {header()}
        <PageStatus {...status} />
      </>
    )

  // Current work is loaded completely, so every number below covers all of it.
  const active = work.data!.filter(isActive)
  const queue = reviewQueue(active, me.id)
  // Approved internally and waiting on the client's decision, longest waiting first.
  const withClient = work
    .data!.filter((p) => p.status === 'client_review')
    .sort((a, b) => (a.latest?.submittedAt ?? '').localeCompare(b.latest?.submittedAt ?? ''))
  const late = active.filter((p) => isOverdue(p, now)).sort(byDeadline)
  const due48 = active.filter((p) => isDueWithin(p, now, 48 * HOUR_MS)).sort(byDeadline)
  const workload = editorWorkload(people, work.data!, now)
  const busyEditors = workload.filter((w) => w.active > 0).length

  const rows: Record<View, PackageSummary[]> = { review: queue, client: withClient, late, due48, active: [...active].sort(byDeadline) }
  const requested = params.get('view') as View | null
  // Start on what needs this manager: reviews, then late work, then everything.
  const view: View = requested && VIEWS.includes(requested) ? requested : queue.length ? 'review' : late.length ? 'late' : 'active'
  const list = rows[view]
  const empty = EMPTY[view]
  const fullPage: Record<View, { to: string; label: string }> = {
    review: { to: '/review', label: 'Open the review queue' },
    client: { to: '/packages?status=client_review', label: 'See them in Packages' },
    late: { to: '/deadlines', label: 'Open Deadlines' },
    due48: { to: '/deadlines', label: 'Open Deadlines' },
    active: { to: '/packages?status=active', label: 'See them in Packages' },
  }

  const reviewing = reviewId ? (queue.find((p) => p.id === reviewId) ?? null) : null
  const editorLoad = editorId ? workload.find((w) => w.editor.id === editorId) : undefined

  const action = (pkg: PackageSummary) =>
    pkg.status === 'submitted' ? (
      <button type="button" aria-haspopup="dialog" className={buttonClasses('secondary', 'sm', 'min-w-28 max-md:min-h-12')} onClick={() => setReviewId(pkg.id)}>
        Review R{pkg.latest?.round ?? 1}
        <span className="sr-only"> {pkg.title}</span>
      </button>
    ) : (
      <Link to={`/packages/${pkg.id}`} className={buttonClasses('ghost', 'sm', 'text-muted-fg')}>
        Open<span className="sr-only"> {pkg.title}</span>
      </Link>
    )

  const meta = (pkg: PackageSummary) => {
    const waiting = pkg.latest && (pkg.status === 'submitted' || pkg.status === 'client_review') ? now.getTime() - new Date(pkg.latest.submittedAt).getTime() : null
    return (
      <>
        <span className="font-mono">{pkg.code}</span>
        {pkg.latest && (
          <>
            {' · '}
            <span className="font-mono">R{pkg.latest.round}</span>
          </>
        )}
        {waiting !== null && <> · waiting {formatDistance(waiting)}</>}
        {' · '}
        {lookup.personName(pkg.editorId)}
      </>
    )
  }

  return (
    <>
      {header(queue.length)}

      <section aria-labelledby="track-title" className={cx(cardClasses, 'overflow-hidden max-md:-mx-4 max-md:rounded-none max-md:border-y max-md:border-border max-md:ring-0')}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-5">
          <h2 id="track-title" className="sr-only">
            Current work
          </h2>
          <Segmented
            label="Current work"
            param="view"
            current={view}
            items={[
              { id: 'review', label: 'Needs review', count: queue.length },
              { id: 'client', label: 'With client', count: withClient.length },
              { id: 'late', label: 'Overdue', count: late.length, late: true },
              { id: 'due48', label: 'Due in 48h', count: due48.length },
              { id: 'active', label: 'All active', count: active.length },
            ]}
          />
        </div>
        {list.length ? (
          <DeadlineTrack
            packages={list}
            now={now}
            lookup={lookup}
            label={`Current work: ${view}`}
            action={action}
            meta={meta}
            tag={(pkg) => view === 'review' && pkg.responsibleManagerId === me.id && <span className="shrink-0 text-sm text-muted-fg">Yours</span>}
          />
        ) : (
          <div className="border-t border-border">
            <EmptyState icon={empty.icon} title={empty.title}>
              {empty.body}
            </EmptyState>
          </div>
        )}
        {list.length > 0 && (
          <div className="border-t border-border px-4 py-3 md:px-5">
            <Link to={fullPage[view].to} className={cx(linkClasses, 'text-sm')}>
              {fullPage[view].label}
            </Link>
          </div>
        )}
      </section>

      <Section
        title="Team workload"
        description={`Active packages per editor · ${busyEditors} of ${workload.length} editors have work`}
        className="mt-6"
        flush
      >
        {workload.length ? (
          <div className="border-t border-border">
            <WorkloadList workload={workload} onSelect={setEditorId} wide />
          </div>
        ) : (
          <EmptyState icon={Users} title="No editors yet" compact>
            An admin adds editors in Staff & Roles.
          </EmptyState>
        )}
      </Section>

      <Dialog
        open={Boolean(editorLoad)}
        onClose={() => setEditorId(null)}
        wide
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
            <div className="-mx-6 border-t border-border">
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
