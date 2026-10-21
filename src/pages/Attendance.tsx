import { Timer, Users } from 'lucide-react'
import { useId } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AttendanceTable } from '../components/domain/AttendanceTable'
import { ClockCard } from '../components/domain/ClockControls'
import { ViewOnlyBanner } from '../components/domain/ViewOnlyBanner'
import { Callout } from '../components/ui/Callout'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader, Section } from '../components/ui/Section'
import { useAppState, useNow } from '../data/hooks'
import { currentlyClockedIn, makeLookup, sessionDurationMs, sessionsFor } from '../data/selectors'
import type { AppState } from '../data/types'
import { DAY_MS, formatDuration, formatTime } from '../lib/time'
import { buttonClasses, cardClasses, cx, inputClasses } from '../lib/styles'
import { useSession } from '../session/context'

export function Attendance() {
  const state = useAppState()
  const now = useNow()
  const { me } = useSession()
  const mine = sessionsFor(state, me.id).filter((s) => now.getTime() - new Date(s.clockIn).getTime() <= 30 * DAY_MS)

  // Admins don't clock in; they see the team's records read-only.
  if (me.role === 'admin')
    return (
      <>
        <PageHeader
          title="Attendance"
          description="Team clock-in records in Manila time (PHT). Sessions count toward their clock-in date, including overnight shifts."
        />
        <ViewOnlyBanner>Attendance is recorded by each manager and editor. Select someone in Team for their full history.</ViewOnlyBanner>
        <div className="flex min-w-0 flex-col gap-5">
          <TeamAttendance state={state} now={now} />
        </div>
      </>
    )

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Clock-in records in Manila time (PHT). Sessions count toward their clock-in date, including overnight shifts."
      />
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-5">
          {me.role === 'manager' ? (
            <div className={cx(cardClasses, 'flex flex-col gap-3 p-4')}>
              <p className="text-sm text-muted-fg">Clock in and out, and see this week’s totals, on the Time Clock page.</p>
              <Link to="/time-clock" className={buttonClasses('secondary', 'md', 'w-full')}>
                <Timer aria-hidden className="size-4" />
                Open time clock
              </Link>
            </div>
          ) : (
            <ClockCard />
          )}
          <Callout tone="info" title="Corrections: later milestone">
            Correction requests (editors) and approvals with an audit history (managers) are planned for a later milestone. This prototype records clock-ins
            and clock-outs only.
          </Callout>
        </div>
        <div className="flex min-w-0 flex-col gap-5 xl:col-span-2">
          {me.role === 'manager' && <TeamAttendance state={state} now={now} />}
          <Section title="My attendance" description="Last 30 days" flush>
            <AttendanceTable state={state} sessions={mine} now={now} caption="My attendance, last 30 days" />
          </Section>
        </div>
      </div>
    </>
  )
}

function TeamAttendance({ state, now }: { state: AppState; now: Date }) {
  const lookup = makeLookup(state)
  const [params, setParams] = useSearchParams()
  const person = params.get('person') ?? ''
  const uid = useId()
  const open = currentlyClockedIn(state)
  const team = state.attendance
    .filter((s) => (!person || s.personId === person) && now.getTime() - new Date(s.clockIn).getTime() <= 14 * DAY_MS)
    .sort((a, b) => b.clockIn.localeCompare(a.clockIn))

  return (
    <>
      <Section title={`Clocked in now (${open.length})`} flush>
        {open.length ? (
          <ul className="divide-y divide-border">
            {open.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm tabular-nums">
                <span className="flex items-center gap-2 font-semibold">
                  <span aria-hidden className="size-2 rounded-full bg-success" />
                  {lookup.personName(s.personId)}
                </span>
                <span className="text-muted-fg">
                  since {formatTime(s.clockIn)} · {formatDuration(sessionDurationMs(s, now))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Users} title="Nobody is clocked in" compact />
        )}
      </Section>
      <Section
        title="Team attendance"
        description="Last 14 days"
        flush
        actions={
          <div className="flex items-center gap-2">
            <label htmlFor={`${uid}-person`} className="text-xs font-semibold text-muted-fg">
              Person
            </label>
            <select
              id={`${uid}-person`}
              value={person}
              onChange={(e) => setParams(e.target.value ? { person: e.target.value } : {}, { replace: true })}
              className={`${inputClasses()} min-h-9 w-auto py-1`}
            >
              <option value="">Everyone</option>
              {state.people
                .filter((p) => p.role !== 'admin')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>
        }
      >
        <AttendanceTable state={state} sessions={team} now={now} showPerson caption="Team attendance, last 14 days" />
      </Section>
    </>
  )
}
