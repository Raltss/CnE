import { CircleCheck, ListTodo } from 'lucide-react'
import { Link } from 'react-router'
import { AttendanceTable } from '../../components/domain/AttendanceTable'
import { ClockCard } from '../../components/domain/ClockControls'
import { DueCountdown } from '../../components/domain/DeadlineBadge'
import { DeadlineTrack } from '../../components/domain/DeadlineTrack'
import { EditorPackageAction } from '../../components/domain/EditorPackageAction'
import { FeedbackNote } from '../../components/domain/FeedbackCard'
import { PackageTable } from '../../components/domain/PackageTable'
import { StatusBadge } from '../../components/domain/StatusBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageStatus } from '../../components/ui/PageStatus'
import { PageHeader, Section } from '../../components/ui/Section'
import { useNow } from '../../data/hooks'
import { pageStatus, pagedRows, pagedTotal, useActiveWork, useDirectory, useFinishedPackages, usePersonAttendance } from '../../data/queries'
import { byDeadline, isActive, isOverdue, withinDays, type Lookup } from '../../data/selectors'
import type { PackageSummary } from '../../data/types'
import { cardClasses, cx, linkClasses } from '../../lib/styles'
import { formatDate, formatDueInline } from '../../lib/time'
import { useSession } from '../../session/context'

/** Changes requested come first, then work already started, then work not started; soonest deadline first in each. */
const URGENCY: Partial<Record<PackageSummary['status'], number>> = { apply_feedback: 0, in_progress: 1, assigned: 2 }

export function MyWork() {
  const now = useNow()
  const { me } = useSession()
  // RLS returns only this editor's packages; the explicit filters say so too.
  const work = useActiveWork()
  const finished = useFinishedPackages({ editor: me.id })
  const attendance = usePersonAttendance(me.id)
  const { lookup, queries } = useDirectory()
  // The header needs no data, so it shows right away; the rest waits for its queries.
  const header = <PageHeader title="My work" description={`${formatDate(now.toISOString())} · Your packages, deadlines and submissions`} />
  const status = pageStatus(work, finished, attendance, ...queries)
  if (status.pending || status.error)
    return (
      <>
        {header}
        <PageStatus {...status} />
      </>
    )

  const mine = work.data!.filter((p) => p.editorId === me.id)
  const active = mine.filter(isActive)
  const late = active.filter((p) => isOverdue(p, now)).length
  // With the client or paused by a manager: not active work (no overdue, no submitting) but still theirs.
  const current = [...mine].sort(byDeadline)
  const next = [...active]
    .filter((p) => p.status in URGENCY)
    .sort((a, b) => URGENCY[a.status]! - URGENCY[b.status]! || byDeadline(a, b))[0]
  const recent = pagedRows(finished.data).slice(0, 5)
  const weekSessions = attendance.data!.filter((s) => withinDays(s.clockIn, 7, now))

  return (
    <>
      {header}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">{next ? <NextUp pkg={next} now={now} lookup={lookup} /> : <AllClear waiting={current.length} />}</div>
        <ClockCard />
      </div>

      <Section
        title="Current work"
        description={`${active.length} active${late ? ` · ${late} overdue` : ''}${current.length > active.length ? ` · ${current.length - active.length} with the client or on hold` : ''}`}
        className="mt-6"
        flush
      >
        {current.length ? (
          <div className="border-t border-border">
            <DeadlineTrack
              packages={current}
              now={now}
              lookup={lookup}
              label="Current work"
              meta={(pkg) => (
                <>
                  <span className="font-mono">{pkg.code}</span>
                  {pkg.latest && (
                    <>
                      {' · '}
                      <span className="font-mono">R{pkg.latest.round}</span>
                    </>
                  )}
                  {' · '}
                  {lookup.productName(pkg.productId)}
                </>
              )}
              action={(pkg) => <EditorPackageAction pkg={pkg} />}
            />
          </div>
        ) : (
          <EmptyState icon={ListTodo} title="No packages assigned" compact>
            New assignments appear here, and you’ll get a notification.
          </EmptyState>
        )}
      </Section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2 xl:items-stretch">
        <Section
          title="Recently finished"
          description={`${pagedTotal(finished.data)} finished in all`}
          flush
          actions={
            <Link to="/history" className={cx(linkClasses, 'text-sm')}>
              View history
            </Link>
          }
        >
          {recent.length ? (
            <PackageTable lookup={lookup} packages={recent} now={now} caption="Recently finished" columns={['package', 'product', 'status', 'round']} />
          ) : (
            <EmptyState icon={CircleCheck} title="No finished work yet" compact>
              Packages you deliver show up here.
            </EmptyState>
          )}
        </Section>
        <Section
          title="This week’s attendance"
          description={`${weekSessions.length} ${weekSessions.length === 1 ? 'session' : 'sessions'} in the last 7 days`}
          flush
          actions={
            <Link to="/attendance" className={cx(linkClasses, 'text-sm')}>
              Full history
            </Link>
          }
        >
          <AttendanceTable sessions={weekSessions.slice(0, 7)} now={now} caption="My attendance this week" />
        </Section>
      </div>
    </>
  )
}

/** The one cut to work on now: its note, its deadline and its next step. */
function NextUp({ pkg, now, lookup }: { pkg: PackageSummary; now: Date; lookup: Lookup }) {
  return (
    <section aria-labelledby="next-up" data-seenry-hero-visual className={cx(cardClasses, 'flex h-full flex-col gap-5 p-5')}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="next-up" className="text-sm font-medium text-muted-fg">
            Next up
          </h2>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            <Link to={`/packages/${pkg.id}`} className="decoration-border-strong underline-offset-4 hover:underline">
              {pkg.title}
            </Link>
          </p>
          <p className="mt-1 text-ui text-muted-fg">
            <span className="font-mono whitespace-nowrap">{pkg.code}</span>
            {pkg.latest && (
              <>
                {' · '}
                <span className="font-mono">R{pkg.latest.round}</span>
              </>
            )}
            {' · '}
            {lookup.productName(pkg.productId)}
          </p>
        </div>
        <StatusBadge status={pkg.status} />
      </div>
      {pkg.status === 'apply_feedback' && <FeedbackNote lookup={lookup} pkg={pkg} />}
      <div className="mt-auto flex flex-wrap items-end justify-between gap-4 border-t border-border pt-4">
        <div>
          <p className="text-ui">Due {formatDueInline(pkg.deadline, now)}</p>
          <DueCountdown pkg={pkg} now={now} />
        </div>
        <EditorPackageAction pkg={pkg} size="md" emphasis />
      </div>
    </section>
  )
}

function AllClear({ waiting }: { waiting: number }) {
  return (
    <section className={cx(cardClasses, 'flex h-full items-center')}>
      <EmptyState icon={CircleCheck} title="You’re all caught up">
        {waiting ? 'Everything of yours is with the client or on hold. You’ll be notified when it moves.' : 'Nothing is assigned to you right now. New work arrives with a notification.'}
      </EmptyState>
    </section>
  )
}
