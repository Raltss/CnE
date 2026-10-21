import { CalendarClock, CircleCheck, ListTodo, RotateCcw, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { AttendanceTable } from '../../components/domain/AttendanceTable'
import { ClockCard } from '../../components/domain/ClockControls'
import { EditorPackageAction } from '../../components/domain/EditorPackageAction'
import { FeedbackCard } from '../../components/domain/FeedbackCard'
import { KpiStat, KpiStrip } from '../../components/domain/KpiStat'
import { PackageTable } from '../../components/domain/PackageTable'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader, Section } from '../../components/ui/Section'
import { useAppState, useNow } from '../../data/hooks'
import { isDueWithin, isOverdue, sessionsFor } from '../../data/selectors'
import { DAY_MS } from '../../lib/time'
import { useSession } from '../../session/context'
import { myActive, myHistory, myNeedsChanges } from './editorData'

export function MyWork() {
  const state = useAppState()
  const now = useNow()
  const { me } = useSession()
  const active = myActive(state, me.id)
  const changes = myNeedsChanges(state, me.id)
  const others = active.filter((p) => p.status !== 'apply_feedback')
  const recent = myHistory(state, me.id).slice(0, 5)
  const weekSessions = sessionsFor(state, me.id).filter((s) => now.getTime() - new Date(s.clockIn).getTime() <= 7 * DAY_MS)

  return (
    <>
      <PageHeader title={`Hi, ${me.name.split(' ')[0]}`} description="Your assigned packages, deadlines, and submissions." />
      <KpiStrip>
        <KpiStat label="Active packages" value={active.length} icon={ListTodo} />
        <KpiStat label="Needs changes" value={changes.length} icon={RotateCcw} to="/needs-changes" tone="attention" />
        <KpiStat label="Due in 7 days" value={active.filter((p) => isDueWithin(p, now, 7 * DAY_MS)).length} icon={CalendarClock} />
        <KpiStat label="Overdue" value={active.filter((p) => isOverdue(p, now)).length} icon={TriangleAlert} tone="danger" />
        <KpiStat label="Completed" value={myHistory(state, me.id).length} icon={CircleCheck} to="/history" />
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
                <FeedbackCard key={pkg.id} state={state} pkg={pkg} now={now} />
              ))}
            </section>
          )}

          <Section title="My packages" description="Sorted by deadline" flush>
            {others.length ? (
              <PackageTable
                state={state}
                packages={others}
                now={now}
                caption="My packages"
                columns={['package', 'product', 'status', 'deadline', 'round']}
                action={(pkg) => <EditorPackageAction pkg={pkg} editorId={me.id} />}
              />
            ) : (
              <EmptyState icon={ListTodo} title={changes.length ? 'No other active packages' : 'No packages assigned'} compact>
                New assignments will appear here, and you’ll get a notification.
              </EmptyState>
            )}
          </Section>

          <Section
            title="Recently completed"
            flush
            actions={
              <Link to="/history" className="text-sm font-semibold text-primary hover:underline">
                View history
              </Link>
            }
          >
            {recent.length ? (
              <PackageTable state={state} packages={recent} now={now} caption="Recently completed" columns={['package', 'product', 'status', 'round']} />
            ) : (
              <EmptyState icon={CircleCheck} title="No completed work yet" compact />
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
            <AttendanceTable state={state} sessions={weekSessions.slice(0, 7)} now={now} caption="My attendance this week" />
          </Section>
        </div>
      </div>
    </>
  )
}
