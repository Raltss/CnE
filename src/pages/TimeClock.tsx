import { CalendarDays, Clock, ListChecks } from 'lucide-react'
import { Link } from 'react-router'
import { AttendanceTable } from '../components/domain/AttendanceTable'
import { ClockPanel } from '../components/domain/ClockControls'
import { KpiStat } from '../components/domain/KpiStat'
import { PageHeader, Section } from '../components/ui/Section'
import { useAppState, useNow } from '../data/hooks'
import { sessionDurationMs, sessionsFor } from '../data/selectors'
import { DAY_MS, formatDuration, manilaDateKey } from '../lib/time'
import { useSession } from '../session/context'

/** Personal clock-in/out with a short summary of the current week. */
export function TimeClock() {
  const state = useAppState()
  const now = useNow()
  const { me } = useSession()
  const today = manilaDateKey(now.toISOString())
  const week = sessionsFor(state, me.id).filter((s) => now.getTime() - new Date(s.clockIn).getTime() <= 7 * DAY_MS)
  // Sessions count toward their clock-in date, including overnight ones.
  const todayMs = week.filter((s) => manilaDateKey(s.clockIn) === today).reduce((sum, s) => sum + sessionDurationMs(s, now), 0)
  const weekMs = week.reduce((sum, s) => sum + sessionDurationMs(s, now), 0)

  return (
    <>
      <PageHeader title="Time clock" description="Clock in when you start working and clock out when you finish." />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <ClockPanel />
        </div>
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            <KpiStat label="Worked" hint="Today" display={formatDuration(todayMs)} icon={Clock} />
            <KpiStat label="Worked" hint="Last 7 days" display={formatDuration(weekMs)} icon={CalendarDays} />
            <KpiStat label="Sessions" hint="Last 7 days" value={week.length} icon={ListChecks} />
          </div>
          <Section
            title="My sessions"
            description="Last 7 days, newest first"
            flush
            actions={
              <Link to="/attendance" className="text-sm font-semibold text-primary hover:underline">
                Full attendance
              </Link>
            }
          >
            <AttendanceTable state={state} sessions={week} now={now} caption="My sessions, last 7 days" />
          </Section>
        </div>
      </div>
    </>
  )
}
