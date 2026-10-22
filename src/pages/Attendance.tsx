import { Timer, Users } from 'lucide-react'
import { useId } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AttendanceTable } from '../components/domain/AttendanceTable'
import { ClockCard } from '../components/domain/ClockControls'
import { ViewOnlyBanner } from '../components/domain/ViewOnlyBanner'
import { Callout } from '../components/ui/Callout'
import { EmptyState } from '../components/ui/EmptyState'
import { PageStatus } from '../components/ui/PageStatus'
import { PageHeader, Section } from '../components/ui/Section'
import { useNow } from '../data/hooks'
import { useDirectory, useOpenSessions, usePersonAttendance, useTeamAttendance } from '../data/queries'
import { sessionDurationMs, withinDays } from '../data/selectors'
import { formatDuration, formatTime } from '../lib/time'
import { buttonClasses, cardClasses, cx, inputClasses } from '../lib/styles'
import { useSession } from '../session/context'

/** How far back the team table goes. */
const TEAM_DAYS = 14

export function Attendance() {
  const { me } = useSession()

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
          <TeamAttendance />
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
          <Callout tone="info" title="Need a correction?">
            CnE records clock-ins and clock-outs only. Correction requests aren’t in the app yet: if a session is wrong or was auto-closed, tell your
            manager.
          </Callout>
        </div>
        <div className="flex min-w-0 flex-col gap-5 xl:col-span-2">
          {me.role === 'manager' && <TeamAttendance />}
          <MyAttendance personId={me.id} />
        </div>
      </div>
    </>
  )
}

function MyAttendance({ personId }: { personId: string }) {
  const now = useNow()
  const sessions = usePersonAttendance(personId)
  const mine = (sessions.data ?? []).filter((s) => withinDays(s.clockIn, 30, now))
  return (
    <Section title="My attendance" description="Last 30 days" flush>
      {sessions.data === undefined ? (
        <PageStatus error={sessions.error?.message} retry={() => void sessions.refetch()} />
      ) : (
        <AttendanceTable sessions={mine} now={now} caption="My attendance, last 30 days" />
      )}
    </Section>
  )
}

function TeamAttendance() {
  const now = useNow()
  const { people, lookup } = useDirectory()
  const [params, setParams] = useSearchParams()
  const person = params.get('person') ?? ''
  const uid = useId()
  const open = useOpenSessions()
  const team = useTeamAttendance(TEAM_DAYS)
  const shown = (team.data ?? []).filter((s) => !person || s.personId === person)

  return (
    <>
      <Section title={open.data ? `Clocked in now (${open.data.length})` : 'Clocked in now'} flush>
        {open.data === undefined ? (
          <PageStatus error={open.error?.message} retry={() => void open.refetch()} />
        ) : open.data!.length ? (
          <ul className="divide-y divide-border">
            {open.data!.map((s) => (
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
        description={`Last ${TEAM_DAYS} days`}
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
              {people
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
        {team.data === undefined ? (
          <PageStatus error={team.error?.message} retry={() => void team.refetch()} />
        ) : (
          <AttendanceTable lookup={lookup} sessions={shown} now={now} showPerson caption={`Team attendance, last ${TEAM_DAYS} days`} />
        )}
      </Section>
    </>
  )
}
