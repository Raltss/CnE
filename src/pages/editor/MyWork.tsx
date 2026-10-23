import { CalendarClock, CircleCheck, ListTodo, RotateCcw, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { AttendanceTable } from '../../components/domain/AttendanceTable'
import { ClockCard } from '../../components/domain/ClockControls'
import { EditorPackageAction } from '../../components/domain/EditorPackageAction'
import { FeedbackCard } from '../../components/domain/FeedbackCard'
import { KpiStat, KpiStrip } from '../../components/domain/KpiStat'
import { PackageTable } from '../../components/domain/PackageTable'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageStatus } from '../../components/ui/PageStatus'
import { PageHeader, Section } from '../../components/ui/Section'
import { useNow } from '../../data/hooks'
import { pageStatus, pagedRows, pagedTotal, useActiveWork, useDirectory, useFinishedPackages, usePersonAttendance } from '../../data/queries'
import { isActive, isDueWithin, isOverdue, withinDays } from '../../data/selectors'
import { DAY_MS } from '../../lib/time'
import { useSession } from '../../session/context'

export function MyWork() {
  const now = useNow()
  const { me } = useSession()
  // RLS returns only this editor's packages; the explicit filters say so too.
  const work = useActiveWork()
  const finished = useFinishedPackages({ editor: me.id })
  const attendance = usePersonAttendance(me.id)
  const { lookup, queries } = useDirectory()
  // The header needs no data, so it shows right away; the rest waits for its queries.
  const header = <PageHeader title={`Hi, ${me.name.split(' ')[0]}`} description="Your assigned packages, deadlines, and submissions." />
  const status = pageStatus(work, finished, attendance, ...queries)
  if (status.pending || status.error)
    return (
      <>
        {header}
        <PageStatus {...status} />
      </>
    )

  const active = work.data!.filter((p) => p.editorId === me.id && isActive(p))
  const changes = active.filter((p) => p.status === 'apply_feedback')
  const others = active.filter((p) => p.status !== 'apply_feedback')
  // With the client or paused by a manager: not active work (no overdue, no submitting) but still theirs.
  const waiting = work.data!.filter((p) => p.editorId === me.id && (p.status === 'client_review' || p.status === 'on_hold'))
  const recent = pagedRows(finished.data).slice(0, 5)
  const weekSessions = attendance.data!.filter((s) => withinDays(s.clockIn, 7, now))

  return (
    <>
      {header}
      <KpiStrip>
        <KpiStat label="Active packages" value={active.length} icon={ListTodo} />
        <KpiStat label="Needs changes" value={changes.length} icon={RotateCcw} to="/needs-changes" tone="attention" />
        <KpiStat label="Due in 7 days" value={active.filter((p) => isDueWithin(p, now, 7 * DAY_MS)).length} icon={CalendarClock} />
        <KpiStat label="Overdue" value={active.filter((p) => isOverdue(p, now)).length} icon={TriangleAlert} tone="danger" />
        <KpiStat label="Finished" value={pagedTotal(finished.data)} icon={CircleCheck} to="/history" />
      </KpiStrip>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-5 xl:col-span-2">
          {changes.length > 0 && (
            <section aria-labelledby="needs-changes-heading" className="flex flex-col gap-3">
              <h2 id="needs-changes-heading" className="flex items-center gap-2 text-base font-semibold">
                <RotateCcw aria-hidden className="size-4 text-st-feedback" />
                Needs changes ({changes.length})
              </h2>
              {changes.map((pkg) => (
                <FeedbackCard key={pkg.id} lookup={lookup} pkg={pkg} now={now} />
              ))}
            </section>
          )}

          <Section title="My packages" description="Sorted by deadline" flush>
            {others.length ? (
              <PackageTable
                lookup={lookup}
                packages={others}
                now={now}
                caption="My packages"
                columns={['package', 'product', 'status', 'deadline', 'round']}
                action={(pkg) => <EditorPackageAction pkg={pkg} />}
              />
            ) : (
              <EmptyState icon={ListTodo} title={changes.length ? 'No other active packages' : 'No packages assigned'} compact>
                New assignments will appear here, and you’ll get a notification.
              </EmptyState>
            )}
          </Section>

          {waiting.length > 0 && (
            <Section
              title={`Waiting on others (${waiting.length})`}
              description="With the client, or paused by a manager. You’ll be notified when they move."
              flush
            >
              <PackageTable
                lookup={lookup}
                packages={waiting}
                now={now}
                caption="Waiting on others"
                columns={['package', 'product', 'status', 'deadline']}
                action={(pkg) => <EditorPackageAction pkg={pkg} />}
              />
            </Section>
          )}

          <Section
            title="Recently finished"
            flush
            actions={
              <Link to="/history" className="text-sm font-semibold text-primary hover:underline">
                View history
              </Link>
            }
          >
            {recent.length ? (
              <PackageTable lookup={lookup} packages={recent} now={now} caption="Recently finished" columns={['package', 'product', 'status', 'round']} />
            ) : (
              <EmptyState icon={CircleCheck} title="No finished work yet" compact />
            )}
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <ClockCard />
          <Section
            title="My attendance this week"
            flush
            actions={
              <Link to="/attendance" className="text-sm font-semibold text-primary hover:underline">
                Full history
              </Link>
            }
          >
            <AttendanceTable sessions={weekSessions.slice(0, 7)} now={now} caption="My attendance this week" />
          </Section>
        </div>
      </div>
    </>
  )
}
