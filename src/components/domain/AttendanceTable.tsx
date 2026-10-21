import { CalendarX2, Moon, TriangleAlert } from 'lucide-react'
import { crossesMidnight, makeLookup, sessionDurationMs } from '../../data/selectors'
import type { AttendanceSession, AppState } from '../../data/types'
import { formatDate, formatDuration, formatShortDate, formatTime } from '../../lib/time'
import { EmptyState } from '../ui/EmptyState'

interface AttendanceTableProps {
  state: AppState
  sessions: AttendanceSession[]
  now: Date
  showPerson?: boolean
  caption: string
}

function Flags({ session, now }: { session: AttendanceSession; now: Date }) {
  return (
    <span className="flex flex-wrap gap-1">
      {!session.clockOut && (
        <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-xs font-semibold text-success">
          <span aria-hidden className="size-1.5 rounded-full bg-success" />
          Open
        </span>
      )}
      {crossesMidnight(session, now) && (
        <span className="inline-flex items-center gap-1 rounded-full bg-info-bg px-2 py-0.5 text-xs font-semibold text-info">
          <Moon aria-hidden className="size-3" />
          Overnight
        </span>
      )}
      {session.autoClosed && (
        <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-xs font-semibold text-warning">
          <TriangleAlert aria-hidden className="size-3" />
          Auto-closed
        </span>
      )}
    </span>
  )
}

/** Sessions are listed under their clock-in date (Manila); overnight clock-outs show the next date. */
export function AttendanceTable({ state, sessions, now, showPerson, caption }: AttendanceTableProps) {
  const lookup = makeLookup(state)
  if (!sessions.length)
    return (
      <EmptyState icon={CalendarX2} title="No attendance records" compact>
        Clock-in sessions will appear here.
      </EmptyState>
    )

  const clockOutText = (s: AttendanceSession) => {
    if (!s.clockOut) return 'Still clocked in'
    return crossesMidnight(s, now) ? `${formatTime(s.clockOut)} (${formatShortDate(s.clockOut)})` : formatTime(s.clockOut)
  }

  return (
    <>
      <table className="hidden w-full border-collapse text-left text-sm md:table">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-2 text-xs font-semibold text-muted-fg">
          <tr>
            <th scope="col" className="px-4 py-2">Date</th>
            {showPerson && <th scope="col" className="px-4 py-2">Person</th>}
            <th scope="col" className="px-4 py-2">Clock in</th>
            <th scope="col" className="px-4 py-2">Clock out</th>
            <th scope="col" className="px-4 py-2">Duration</th>
            <th scope="col" className="px-4 py-2">Flags</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {sessions.map((s) => (
            <tr key={s.id} className="border-t border-border">
              <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(s.clockIn)}</td>
              {showPerson && <td className="px-4 py-2.5">{lookup.personName(s.personId)}</td>}
              <td className="px-4 py-2.5">{formatTime(s.clockIn)}</td>
              <td className="px-4 py-2.5">{clockOutText(s)}</td>
              <td className="px-4 py-2.5">{formatDuration(sessionDurationMs(s, now))}</td>
              <td className="px-4 py-2.5">
                <Flags session={s} now={now} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="divide-y divide-border md:hidden" aria-label={caption}>
        {sessions.map((s) => (
          <li key={s.id} className="flex flex-col gap-1 px-4 py-3 text-sm tabular-nums">
            <div className="flex justify-between gap-2">
              <span className="font-semibold">{formatDate(s.clockIn)}</span>
              <span>{formatDuration(sessionDurationMs(s, now))}</span>
            </div>
            {showPerson && <span>{lookup.personName(s.personId)}</span>}
            <span className="text-muted-fg">
              {formatTime(s.clockIn)} → {clockOutText(s)}
            </span>
            <Flags session={s} now={now} />
          </li>
        ))}
      </ul>
    </>
  )
}
