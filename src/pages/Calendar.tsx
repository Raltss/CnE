import { CalendarCheck, ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { ViewOnlyBanner } from '../components/domain/ViewOnlyBanner'
import { EmptyState } from '../components/ui/EmptyState'
import { PageStatus } from '../components/ui/PageStatus'
import { PageHeader } from '../components/ui/Section'
import { useIsWide, useNow } from '../data/hooks'
import { pageStatus, useActiveWork, useDirectory } from '../data/queries'
import { byDeadline, editors, isActive, isOverdue, type Lookup } from '../data/selectors'
import type { PackageSummary, Person } from '../data/types'
import { backState } from '../lib/back'
import { STATUS_META } from '../lib/status'
import { buttonClasses, cardClasses, cx } from '../lib/styles'
import { addDays, formatDayKey, formatDayRange, formatTime, isDateKey, manilaDateKey, mondayOf } from '../lib/time'
import { useSession } from '../session/context'

/** An editor with this many active packages due on one day is flagged as a busy day. */
const BUSY_DAY = 3

type LinkState = ReturnType<typeof backState>

/**
 * Deadlines for one week (Manila), one row per editor, so crunch days show before more
 * work is assigned. Shows current work: active packages, plus those with the client or
 * on hold (dashed). Overdue work from earlier weeks gets its own column on this week.
 */
export function Calendar() {
  const now = useNow()
  const wide = useIsWide()
  const location = useLocation()
  const { me } = useSession()
  const [params, setParams] = useSearchParams()
  const work = useActiveWork()
  const { people, lookup, queries } = useDirectory()

  const today = manilaDateKey(now.toISOString())
  const thisWeek = mondayOf(today)
  const requested = params.get('week')
  const week = isDateKey(requested) ? mondayOf(requested) : thisWeek
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i))
  const isThisWeek = week === thisWeek
  const scope = me.role === 'manager' && params.get('scope') === 'mine' ? 'mine' : 'all'
  const linkState = backState(location, 'Calendar')

  const weekLink = (monday: string) => {
    const next = new URLSearchParams(params)
    if (monday === thisWeek) next.delete('week')
    else next.set('week', monday)
    return `?${next.toString()}`
  }

  const header = (
    <PageHeader
      title="Calendar"
      description="Deadlines per editor for the week, in Manila time (PHT). Busy days and overdue work stand out."
      actions={
        me.role === 'manager' && (
          <div className="flex gap-1 rounded-lg border border-border bg-surface p-1" role="group" aria-label="Whose packages">
            {(['all', 'mine'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={scope === value}
                onClick={() => {
                  const next = new URLSearchParams(params)
                  if (value === 'all') next.delete('scope')
                  else next.set('scope', value)
                  setParams(next, { replace: true })
                }}
                className={cx(
                  'min-h-10 rounded-md px-4 text-sm font-semibold transition-colors duration-150',
                  scope === value ? 'bg-primary text-on-primary' : 'text-muted-fg hover:bg-surface-2 hover:text-fg',
                )}
              >
                {value === 'all' ? 'All packages' : 'I’m responsible'}
              </button>
            ))}
          </div>
        )
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

  const inScope = work.data!.filter((p) => scope === 'all' || p.responsibleManagerId === me.id)
  const dayOf = (p: PackageSummary) => manilaDateKey(p.deadline)
  const due = inScope.filter((p) => dayOf(p) >= days[0] && dayOf(p) <= days[6]).sort(byDeadline)
  // Overdue from before this week: shown on the current week only, where it still needs action.
  const earlier = isThisWeek ? inScope.filter((p) => dayOf(p) < week && isOverdue(p, now)).sort(byDeadline) : []
  const shown = [...earlier, ...due]

  // Every active editor gets a row; a deactivated editor appears only if they still hold work here.
  const rows: Person[] = [...editors(people)]
  for (const p of shown) if (!rows.some((r) => r.id === p.editorId)) rows.push(people.find((x) => x.id === p.editorId) ?? unknownPerson(p.editorId))
  const cell = (editorId: string, day: string | 'earlier') =>
    (day === 'earlier' ? earlier : due).filter((p) => p.editorId === editorId && (day === 'earlier' || dayOf(p) === day))
  const activeDue = due.filter(isActive).length

  return (
    <>
      {header}
      {me.role === 'admin' && <ViewOnlyBanner />}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tabular-nums" aria-live="polite">
          {formatDayRange(days[0], days[6])}
          <span className="ml-2 text-sm font-normal text-muted-fg">
            {activeDue} active {activeDue === 1 ? 'package' : 'packages'} due
            {earlier.length > 0 && ` · ${earlier.length} overdue from earlier`}
          </span>
        </h2>
        <nav aria-label="Weeks" className="flex items-center gap-1">
          <Link to={weekLink(addDays(week, -7))} replace className={buttonClasses('secondary', 'sm')}>
            <ChevronLeft aria-hidden className="size-4" />
            <span className="sr-only sm:not-sr-only">Previous week</span>
          </Link>
          <Link to={weekLink(thisWeek)} replace aria-current={isThisWeek ? 'date' : undefined} className={buttonClasses('secondary', 'sm')}>
            This week
          </Link>
          <Link to={weekLink(addDays(week, 7))} replace className={buttonClasses('secondary', 'sm')}>
            <span className="sr-only sm:not-sr-only">Next week</span>
            <ChevronRight aria-hidden className="size-4" />
          </Link>
        </nav>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="No editors yet">
          Approve editor accounts in Staff &amp; Roles.
        </EmptyState>
      ) : wide ? (
        <div className={cx(cardClasses, 'overflow-x-auto')}>
          <table className="w-full min-w-[56rem] table-fixed border-collapse text-left text-sm">
            <caption className="sr-only">Deadlines per editor, {formatDayRange(days[0], days[6])}</caption>
            <thead className="bg-surface-2 text-xs font-semibold text-muted-fg">
              <tr>
                <th scope="col" className="w-40 px-3 py-2">
                  Editor
                </th>
                {earlier.length > 0 && (
                  <th scope="col" className="w-36 px-2 py-2 text-danger">
                    <span className="inline-flex items-center gap-1">
                      <TriangleAlert aria-hidden className="size-3.5" />
                      Overdue
                    </span>
                    <span className="block font-normal">From earlier weeks</span>
                  </th>
                )}
                {days.map((day) => (
                  <th
                    key={day}
                    scope="col"
                    aria-current={day === today ? 'date' : undefined}
                    className={cx('px-2 py-2', day === today && 'bg-primary/10 text-primary')}
                  >
                    <span className="block">{formatDayKey(day)}</span>
                    <span className="block font-normal tabular-nums">
                      {day === today ? 'Today · ' : ''}
                      {due.filter((p) => dayOf(p) === day).length} due
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((person) => {
                const mine = due.filter((p) => p.editorId === person.id && isActive(p)).length
                return (
                  <tr key={person.id} className="border-t border-border align-top">
                    <th scope="row" className="px-3 py-2 font-normal">
                      <span className="block truncate font-semibold">{person.name}</span>
                      <span className="block text-xs text-muted-fg tabular-nums">
                        {mine} due this week{!person.isActive && ' · deactivated'}
                      </span>
                    </th>
                    {earlier.length > 0 && (
                      <td className="border-l border-border bg-danger-bg/40 px-1.5 py-1.5">
                        <Chips packages={cell(person.id, 'earlier')} lookup={lookup} now={now} linkState={linkState} showDate />
                      </td>
                    )}
                    {days.map((day) => {
                      const items = cell(person.id, day)
                      const busy = items.filter(isActive).length >= BUSY_DAY
                      return (
                        <td
                          key={day}
                          className={cx('border-l border-border px-1.5 py-1.5', busy ? 'bg-warning-bg/60' : day === today && 'bg-primary/5')}
                        >
                          {busy && (
                            <p className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-warning">
                              <TriangleAlert aria-hidden className="size-3.5" />
                              Busy day
                            </p>
                          )}
                          <Chips packages={items} lookup={lookup} now={now} linkState={linkState} />
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <AgendaByDay days={days} today={today} earlier={earlier} due={due} lookup={lookup} now={now} linkState={linkState} />
      )}

      {shown.length === 0 && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-fg">
          <CalendarCheck aria-hidden className="size-4" />
          No deadlines this week{scope === 'mine' ? ' for packages you’re responsible for' : ''}.
        </p>
      )}
      <Legend />
    </>
  )
}

const unknownPerson = (id: string): Person => ({ id, name: 'Unknown editor', title: '', role: 'editor', isActive: false })

/** One package per chip: status icon and label, title, due time; overdue in red with an icon. */
function Chips({
  packages,
  lookup,
  now,
  linkState,
  showDate,
  showEditor,
}: {
  packages: PackageSummary[]
  lookup: Lookup
  now: Date
  linkState: LinkState
  showDate?: boolean
  showEditor?: boolean
}) {
  if (!packages.length) return null
  return (
    <ul className="flex flex-col gap-1">
      {packages.map((pkg) => {
        const meta = STATUS_META[pkg.status]
        const Icon = meta.icon
        const overdue = isOverdue(pkg, now)
        const waiting = !isActive(pkg)
        return (
          <li key={pkg.id}>
            <Link
              to={`/packages/${pkg.id}`}
              state={linkState}
              className={cx(
                'block rounded-md border bg-surface px-2 py-1.5 transition-colors duration-150 hover:bg-surface-2',
                overdue ? 'border-danger/60' : 'border-border-strong',
                // With the client or on hold: not the editor's work right now.
                waiting && 'border-dashed',
              )}
            >
              <span className="flex items-start gap-1.5">
                <span className={cx('mt-0.5 inline-flex shrink-0 rounded-full p-0.5', meta.className)}>
                  <Icon aria-hidden className="size-3" strokeWidth={2.5} />
                </span>
                <span className="min-w-0">
                  <span className={cx('line-clamp-2 text-xs font-semibold break-words', waiting && 'text-muted-fg')}>{pkg.title}</span>
                  <span className="block text-[11px] text-muted-fg tabular-nums">
                    {showDate ? formatDayKey(manilaDateKey(pkg.deadline)) : formatTime(pkg.deadline)}
                    {showEditor && ` · ${lookup.personName(pkg.editorId)}`}
                    {' · '}
                    {meta.label}
                  </span>
                  {overdue && (
                    <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-danger">
                      <TriangleAlert aria-hidden className="size-3" />
                      Overdue
                    </span>
                  )}
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/** Phones: the week as a list of days, each package with its editor. */
function AgendaByDay({
  days,
  today,
  earlier,
  due,
  lookup,
  now,
  linkState,
}: {
  days: string[]
  today: string
  earlier: PackageSummary[]
  due: PackageSummary[]
  lookup: Lookup
  now: Date
  linkState: LinkState
}) {
  const groups = [
    ...(earlier.length ? [{ key: 'earlier', title: 'Overdue from earlier weeks', packages: earlier, today: false }] : []),
    ...days.map((day) => ({ key: day, title: formatDayKey(day), packages: due.filter((p) => manilaDateKey(p.deadline) === day), today: day === today })),
  ]
  return (
    <ol className="flex flex-col gap-3">
      {groups.map((group) => {
        const busyEditors = new Set(
          group.packages.filter(isActive).filter((p, _, all) => all.filter((o) => o.editorId === p.editorId).length >= BUSY_DAY).map((p) => p.editorId),
        )
        return (
          <li key={group.key} className={cx(cardClasses, 'p-3', group.today && 'border-primary/50')}>
            <h3 className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
              <span aria-current={group.today ? 'date' : undefined} className={cx(group.key === 'earlier' && 'text-danger')}>
                {group.title}
                {group.today && <span className="ml-2 text-xs font-normal text-primary">Today</span>}
              </span>
              <span className="text-xs font-normal text-muted-fg tabular-nums">{group.packages.length} due</span>
            </h3>
            {busyEditors.size > 0 && (
              <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-warning">
                <TriangleAlert aria-hidden className="size-3.5" />
                Busy day for {[...busyEditors].map((id) => lookup.personName(id)).join(', ')}
              </p>
            )}
            {group.packages.length ? (
              <div className="mt-2">
                <Chips packages={group.packages} lookup={lookup} now={now} linkState={linkState} showEditor showDate={group.key === 'earlier'} />
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted-fg">Nothing due.</p>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function Legend() {
  return (
    <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-fg">
      <span className="inline-flex items-center gap-1">
        <TriangleAlert aria-hidden className="size-3.5 text-warning" />
        Busy day: {BUSY_DAY} or more active packages due for one editor
      </span>
      <span className="inline-flex items-center gap-1">
        <TriangleAlert aria-hidden className="size-3.5 text-danger" />
        Overdue
      </span>
      <span>Dashed outline: with the client or on hold (not counted as workload)</span>
    </p>
  )
}
