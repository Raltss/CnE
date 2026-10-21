import { ArrowLeft, CalendarClock, CircleCheck, FolderSearch, Inbox, Play, Scale, TriangleAlert, UserRoundX } from 'lucide-react'
import { useId } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { AttendanceTable } from '../../components/domain/AttendanceTable'
import { KpiStat } from '../../components/domain/KpiStat'
import { PackageTable } from '../../components/domain/PackageTable'
import { AccessBadge, RoleBadge } from '../../components/domain/StatusBadge'
import { SubmissionTable } from '../../components/domain/SubmissionTable'
import { ViewOnlyBanner } from '../../components/domain/ViewOnlyBanner'
import { EmptyState } from '../../components/ui/EmptyState'
import { FilterSelect } from '../../components/ui/FilterSelect'
import { Section } from '../../components/ui/Section'
import { TabNav } from '../../components/ui/TabNav'
import { useAppState, useNow } from '../../data/hooks'
import {
  decisionsBy,
  EMPTY_FILTERS,
  filterPackages,
  isActive,
  isOverdue,
  sessionDurationMs,
  sessionsFor,
  submissionsBy,
  totalDurationMs,
  type PackageFilters,
} from '../../data/selectors'
import type { AppState, Person, Submission } from '../../data/types'
import { openSession } from '../../data/workflow'
import { STATUS_META, WORKFLOW_STATUSES } from '../../lib/status'
import { buttonClasses, cardClasses, cx } from '../../lib/styles'
import { DAY_MS, formatDuration, formatTime } from '../../lib/time'
import { useSession } from '../../session/context'
import { reviewQueue } from '../manager/reviewQueue'

type Params = ReturnType<typeof useSearchParams>[0]

const PERIODS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
]
const ATTENDANCE_PERIODS = [
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
]

const withinDays = (iso: string | null, days: number, now: Date) => Boolean(iso) && now.getTime() - new Date(iso!).getTime() <= days * DAY_MS

/** Admin: one manager's or editor's work, read-only, with URL filters per tab. */
export function PersonDetail() {
  const { id } = useParams()
  const state = useAppState()
  const now = useNow()
  const { me } = useSession()
  const [params, setParams] = useSearchParams()
  const person = state.people.find((p) => p.id === id && p.role !== 'admin')

  if (!person)
    return (
      <EmptyState
        icon={UserRoundX}
        title="No manager or editor here"
        tone="error"
        action={
          <Link to="/team" className={buttonClasses('primary')}>
            Back to team
          </Link>
        }
      >
        The link may be wrong, or the account isn’t a manager or editor.
      </EmptyState>
    )

  const account = state.accounts.find((a) => a.id === person.id)
  const first = person.name.split(' ')[0]
  const isEditor = person.role === 'editor'
  const tabs = isEditor
    ? [
        { id: 'packages', label: 'Assignments' },
        { id: 'submissions', label: 'Submissions' },
        { id: 'attendance', label: 'Attendance' },
      ]
    : [
        { id: 'packages', label: 'Packages' },
        { id: 'reviews', label: 'Review queue' },
        { id: 'decisions', label: 'Decisions' },
        { id: 'attendance', label: 'Attendance' },
      ]
  const tab = tabs.find((t) => t.id === params.get('tab'))?.id ?? 'packages'

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const held = state.packages.filter((p) => (isEditor ? p.editorId : p.responsibleManagerId) === person.id)
  const active = held.filter(isActive)
  const overdue = active.filter((p) => isOverdue(p, now))
  const awaitingReview = active.filter((p) => p.status === 'submitted')
  const completed30 = held.filter((p) => p.status === 'completed' && withinDays(p.completedAt, 30, now))
  const decisions30 = decisionsBy(state, person.id).filter((d) => withinDays(d.decidedAt, 30, now))
  const open = openSession(state, person.id)

  return (
    <>
      <Link
        to={`/team?role=${person.role}`}
        className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Team
      </Link>

      <header className={cx(cardClasses, 'mb-5 flex flex-wrap items-start justify-between gap-3 p-4')}>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{person.name}</h1>
          <p className="mt-0.5 truncate text-sm text-muted-fg">
            {person.title}
            {account?.email && ` · ${account.email}`}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            <RoleBadge role={person.role} />
            <AccessBadge account={person} />
            {open ? (
              <span className="inline-flex items-center gap-1.5 text-sm tabular-nums">
                <span aria-hidden className="size-2 rounded-full bg-success" />
                Clocked in since {formatTime(open.clockIn)} ({formatDuration(sessionDurationMs(open, now))})
              </span>
            ) : (
              <span className="text-sm text-muted-fg">Not clocked in</span>
            )}
          </p>
        </div>
        <Link to={`/staff?manage=${person.id}`} className={buttonClasses('secondary', 'sm')}>
          Manage access
        </Link>
      </header>

      <ViewOnlyBanner>
        You’re signed in as yourself ({me.name}). This page shows {person.name}’s work; nothing here acts on {first}’s behalf, and packages change only
        through managers and editors.
      </ViewOnlyBanner>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {isEditor ? (
          <>
            <KpiStat label="Active" value={active.length} hint="Assigned to them now" icon={Play} to="?tab=packages&status=active" />
            <KpiStat label="Overdue" value={overdue.length} hint="Past the final deadline" icon={TriangleAlert} tone="danger" to="?tab=packages&due=overdue" />
            <KpiStat
              label="Awaiting review"
              value={awaitingReview.length}
              hint="Submitted, waiting for a manager"
              icon={Inbox}
              tone="attention"
              to="?tab=packages&status=submitted"
            />
            <KpiStat label="Completed" value={completed30.length} hint="Last 30 days" icon={CircleCheck} to="?tab=packages&status=completed" />
          </>
        ) : (
          <>
            <KpiStat label="Responsible for" value={active.length} hint="Active packages" icon={Play} to="?tab=packages&status=active" />
            <KpiStat label="Awaiting their review" value={awaitingReview.length} hint="Submitted rounds" icon={Inbox} tone="attention" to="?tab=reviews" />
            <KpiStat label="Overdue" value={overdue.length} hint="Packages they’re responsible for" icon={TriangleAlert} tone="danger" to="?tab=packages&due=overdue" />
            <KpiStat label="Decisions" value={decisions30.length} hint="Approvals and feedback, last 30 days" icon={Scale} to="?tab=decisions" />
          </>
        )}
      </div>

      <TabNav label={`${person.name}’s work`} tabs={tabs} current={tab} />

      {tab === 'packages' && <PackagesTab state={state} person={person} params={params} set={set} now={now} />}
      {tab === 'reviews' && <ReviewsTab state={state} person={person} now={now} />}
      {(tab === 'submissions' || tab === 'decisions') && (
        <RoundsTab state={state} person={person} params={params} set={set} now={now} decisions={tab === 'decisions'} />
      )}
      {tab === 'attendance' && <AttendanceTab state={state} person={person} params={params} set={set} now={now} />}
    </>
  )
}

interface TabProps {
  state: AppState
  person: Person
  params: Params
  set: (key: string, value: string) => void
  now: Date
}

function PackagesTab({ state, person, params, set, now }: TabProps) {
  const uid = useId()
  const isEditor = person.role === 'editor'
  const created = !isEditor && params.get('relation') === 'created'
  const filters: PackageFilters = {
    ...EMPTY_FILTERS,
    client: params.get('client') ?? '',
    status: (params.get('status') ?? '') as PackageFilters['status'],
    due: (params.get('due') ?? '') as PackageFilters['due'],
    ...(isEditor ? { editor: person.id } : created ? {} : { manager: person.id }),
  }
  const results = filterPackages(state, filters, now).filter((p) => !created || p.createdById === person.id)
  const filtered = ['relation', 'client', 'status', 'due'].some((k) => params.get(k))

  return (
    <>
      <form
        role="search"
        aria-label={`Filter ${person.name}’s packages`}
        className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => e.preventDefault()}
      >
        {!isEditor && (
          <FilterSelect
            id={`${uid}-relation`}
            label="Show packages"
            value={created ? 'created' : ''}
            onChange={(v) => set('relation', v)}
            options={[{ value: 'created', label: `${person.name.split(' ')[0]} created` }]}
            all="They’re responsible for"
          />
        )}
        <FilterSelect
          id={`${uid}-status`}
          label="Status"
          value={filters.status}
          onChange={(v) => set('status', v)}
          options={[{ value: 'active', label: 'All active' }, ...WORKFLOW_STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label }))]}
          all="Any status"
        />
        <FilterSelect
          id={`${uid}-client`}
          label="Client"
          value={filters.client}
          onChange={(v) => set('client', v)}
          options={state.clients.map((c) => ({ value: c.id, label: c.name }))}
          all="All clients"
        />
        <FilterSelect
          id={`${uid}-due`}
          label="Deadline"
          value={filters.due}
          onChange={(v) => set('due', v)}
          options={[
            { value: 'overdue', label: 'Overdue' },
            { value: '48h', label: 'Due in 48 hours' },
            { value: 'week', label: 'Due in 7 days' },
          ]}
          all="Any deadline"
        />
      </form>
      <Section
        title={`${results.length} ${results.length === 1 ? 'package' : 'packages'}`}
        description="Active work first by deadline, then finished work, most recent first"
        flush
      >
        {results.length ? (
          <PackageTable
            state={state}
            packages={results}
            now={now}
            caption={`${person.name}’s packages`}
            columns={
              isEditor
                ? ['package', 'clientProduct', 'manager', 'status', 'deadline', 'round']
                : ['package', 'clientProduct', 'editor', 'status', 'deadline', 'round']
            }
          />
        ) : (
          <EmptyState icon={FolderSearch} title={filtered ? 'No packages match these filters' : 'No packages yet'} compact>
            {filtered ? 'Try another status, client, or deadline.' : `Packages ${isEditor ? 'assigned to' : 'handled by'} ${person.name} will show up here.`}
          </EmptyState>
        )}
      </Section>
    </>
  )
}

function ReviewsTab({ state, person, now }: Omit<TabProps, 'params' | 'set'>) {
  const queue = reviewQueue(state, person.id).filter((p) => p.responsibleManagerId === person.id)
  return (
    <Section
      title={`${queue.length} awaiting review`}
      description={`Submitted packages ${person.name} is responsible for, oldest submission first. Any manager can review them.`}
      flush
    >
      {queue.length ? (
        <PackageTable
          state={state}
          packages={queue}
          now={now}
          caption={`Packages awaiting ${person.name}’s review`}
          columns={['package', 'editor', 'round', 'submitted', 'deadline']}
        />
      ) : (
        <EmptyState icon={Inbox} title="Nothing waiting for review" compact />
      )}
    </Section>
  )
}

function RoundsTab({ state, person, params, set, now, decisions }: TabProps & { decisions: boolean }) {
  const uid = useId()
  const outcome = params.get('outcome') ?? ''
  const days = Number(params.get('days') ?? '') || null
  const all: Submission[] = decisions ? decisionsBy(state, person.id) : submissionsBy(state, person.id)
  const rows = all.filter(
    (s) => (!outcome || s.outcome === outcome) && (!days || withinDays(decisions ? s.decidedAt : s.submittedAt, days, now)),
  )
  const outcomes = decisions
    ? [
        { value: 'approved', label: 'Approved' },
        { value: 'feedback', label: 'Apply Feedback' },
      ]
    : [
        { value: 'pending', label: 'Awaiting review' },
        { value: 'feedback', label: 'Apply Feedback' },
        { value: 'approved', label: 'Approved' },
      ]

  return (
    <>
      <form
        role="search"
        aria-label={decisions ? `Filter ${person.name}’s decisions` : `Filter ${person.name}’s submissions`}
        className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => e.preventDefault()}
      >
        <FilterSelect id={`${uid}-outcome`} label="Outcome" value={outcome} onChange={(v) => set('outcome', v)} options={outcomes} all="Any outcome" />
        <FilterSelect
          id={`${uid}-days`}
          label={decisions ? 'Decided' : 'Submitted'}
          value={days ? String(days) : ''}
          onChange={(v) => set('days', v)}
          options={PERIODS}
          all="Any time"
        />
      </form>
      <Section
        title={`${rows.length} ${rows.length === 1 ? 'round' : 'rounds'}`}
        description={decisions ? `Rounds ${person.name} approved or sent back for changes` : `Every round ${person.name} submitted, newest first`}
        flush
      >
        <SubmissionTable
          state={state}
          submissions={rows}
          caption={decisions ? `${person.name}’s review decisions` : `${person.name}’s submission rounds`}
          person={decisions ? 'submitter' : 'decider'}
          emptyText={outcome || days ? 'Try another outcome or period.' : undefined}
        />
      </Section>
    </>
  )
}

function AttendanceTab({ state, person, params, set, now }: TabProps) {
  const uid = useId()
  const days = Number(params.get('days') ?? '') || 14
  const sessions = sessionsFor(state, person.id).filter((s) => withinDays(s.clockIn, days, now))
  const autoClosed = sessions.filter((s) => s.autoClosed).length

  return (
    <>
      <form
        role="search"
        aria-label={`Filter ${person.name}’s attendance`}
        className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => e.preventDefault()}
      >
        <FilterSelect
          id={`${uid}-days`}
          label="Period"
          value={String(days)}
          onChange={(v) => set('days', v === '14' ? '' : v)}
          options={ATTENDANCE_PERIODS}
        />
      </form>
      <Section
        title={`${formatDuration(totalDurationMs(sessions, now))} over ${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3">
            <span>Manila time (PHT); sessions count toward their clock-in date</span>
            {autoClosed > 0 && (
              <span className="inline-flex items-center gap-1 font-semibold text-warning">
                <CalendarClock aria-hidden className="size-3.5" />
                {autoClosed} auto-closed
              </span>
            )}
          </span>
        }
        flush
      >
        <AttendanceTable state={state} sessions={sessions} now={now} caption={`${person.name}’s attendance, last ${days} days`} />
      </Section>
    </>
  )
}
