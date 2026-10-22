import { ArrowLeft, CalendarClock, CircleCheck, Inbox, Play, Scale, TriangleAlert, UserRoundX } from 'lucide-react'
import { useId } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { AttendanceTable } from '../../components/domain/AttendanceTable'
import { KpiStat } from '../../components/domain/KpiStat'
import { PackageSections } from '../../components/domain/PackageSections'
import { PackageTable } from '../../components/domain/PackageTable'
import { AccessBadge, RoleBadge } from '../../components/domain/StatusBadge'
import { SubmissionTable } from '../../components/domain/SubmissionTable'
import { ViewOnlyBanner } from '../../components/domain/ViewOnlyBanner'
import { EmptyState } from '../../components/ui/EmptyState'
import { FilterSelect } from '../../components/ui/FilterSelect'
import { LoadMore, PageStatus } from '../../components/ui/PageStatus'
import { Section } from '../../components/ui/Section'
import { TabNav } from '../../components/ui/TabNav'
import { useNow } from '../../data/hooks'
import {
  pageStatus,
  pagedRows,
  pagedTotal,
  useAccounts,
  useActiveWork,
  useDirectory,
  useOpenSessions,
  usePersonAttendance,
  useRecentCompletions,
  useRecentDecisions,
  useRounds,
} from '../../data/queries'
import {
  EMPTY_FILTERS,
  FINISHED_STATUSES,
  filterActive,
  isActive,
  isOverdue,
  reviewQueue,
  sessionDurationMs,
  showsActive,
  showsFinished,
  totalDurationMs,
  type Lookup,
  type PackageFilters,
} from '../../data/selectors'
import type { PackageStatus, PackageSummary, Person, Product, SubmissionOutcome } from '../../data/types'
import { STATUS_META, WORKFLOW_STATUSES } from '../../lib/status'
import { buttonClasses, cardClasses, cx } from '../../lib/styles'
import { formatDuration, formatTime } from '../../lib/time'
import { useSession } from '../../session/context'

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

/** Admin: one manager's or editor's work, read-only, with URL filters per tab. */
export function PersonDetail() {
  const { id } = useParams()
  const now = useNow()
  const { me } = useSession()
  const [params, setParams] = useSearchParams()
  const work = useActiveWork()
  const accounts = useAccounts()
  const open = useOpenSessions()
  const completions = useRecentCompletions()
  const decisions = useRecentDecisions()
  const { people, products, lookup, queries } = useDirectory()
  const status = pageStatus(work, accounts, open, completions, decisions, ...queries)
  if (status.pending || status.error) return <PageStatus {...status} />

  const person = people.find((p) => p.id === id && p.role !== 'admin')
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

  const account = accounts.data!.find((a) => a.id === person.id)
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

  // Current work is loaded completely; the 30-day totals come from complete 30-day lists.
  const active = work.data!.filter((p) => (isEditor ? p.editorId : p.responsibleManagerId) === person.id && isActive(p))
  const overdue = active.filter((p) => isOverdue(p, now))
  const awaitingReview = active.filter((p) => p.status === 'submitted')
  const completed30 = completions.data!.filter((c) => c.editorId === person.id).length
  const decisions30 = decisions.data!.filter((d) => d.decidedById === person.id).length
  const openSession = open.data!.find((s) => s.personId === person.id)

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
            {openSession ? (
              <span className="inline-flex items-center gap-1.5 text-sm tabular-nums">
                <span aria-hidden className="size-2 rounded-full bg-success" />
                Clocked in since {formatTime(openSession.clockIn)} ({formatDuration(sessionDurationMs(openSession, now))})
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
            <KpiStat label="Completed" value={completed30} hint="Last 30 days" icon={CircleCheck} to="?tab=packages&status=completed" />
          </>
        ) : (
          <>
            <KpiStat label="Responsible for" value={active.length} hint="Active packages" icon={Play} to="?tab=packages&status=active" />
            <KpiStat label="Awaiting their review" value={awaitingReview.length} hint="Submitted rounds" icon={Inbox} tone="attention" to="?tab=reviews" />
            <KpiStat label="Overdue" value={overdue.length} hint="Packages they’re responsible for" icon={TriangleAlert} tone="danger" to="?tab=packages&due=overdue" />
            <KpiStat label="Decisions" value={decisions30} hint="Approvals and feedback, last 30 days" icon={Scale} to="?tab=decisions" />
          </>
        )}
      </div>

      <TabNav label={`${person.name}’s work`} tabs={tabs} current={tab} />

      {tab === 'packages' && (
        <PackagesTab person={person} packages={work.data!} products={products} lookup={lookup} params={params} set={set} now={now} />
      )}
      {tab === 'reviews' && <ReviewsTab person={person} packages={work.data!} lookup={lookup} now={now} />}
      {(tab === 'submissions' || tab === 'decisions') && (
        <RoundsTab person={person} lookup={lookup} params={params} set={set} decisions={tab === 'decisions'} />
      )}
      {tab === 'attendance' && <AttendanceTab person={person} params={params} set={set} now={now} />}
    </>
  )
}

interface TabProps {
  person: Person
  params: Params
  set: (key: string, value: string) => void
}

function PackagesTab({
  person,
  packages,
  products,
  lookup,
  params,
  set,
  now,
}: TabProps & { packages: PackageSummary[]; products: Product[]; lookup: Lookup; now: Date }) {
  const uid = useId()
  const isEditor = person.role === 'editor'
  const created = !isEditor && params.get('relation') === 'created'
  const filters: PackageFilters = {
    ...EMPTY_FILTERS,
    product: params.get('product') ?? '',
    status: (params.get('status') ?? '') as PackageFilters['status'],
    due: (params.get('due') ?? '') as PackageFilters['due'],
    ...(isEditor ? { editor: person.id } : created ? {} : { manager: person.id }),
  }
  const current = filterActive(packages, filters, now).filter((p) => !created || p.createdById === person.id)

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
          id={`${uid}-product`}
          label="Product"
          value={filters.product}
          onChange={(v) => set('product', v)}
          options={products.map((p) => ({ value: p.id, label: p.name }))}
          all="All products"
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
      <PackageSections
        lookup={lookup}
        now={now}
        active={showsActive(filters) ? current : null}
        finished={
          showsFinished(filters)
            ? {
                product: filters.product,
                editor: filters.editor,
                manager: filters.manager,
                createdBy: created ? person.id : undefined,
                status: FINISHED_STATUSES.includes(filters.status as PackageStatus) ? (filters.status as PackageStatus) : undefined,
              }
            : null
        }
        caption={`${person.name}’s packages`}
        columns={isEditor ? ['package', 'product', 'manager', 'status', 'deadline', 'round'] : ['package', 'product', 'editor', 'status', 'deadline', 'round']}
        emptyHint="Try another status, product, or deadline."
      />
    </>
  )
}

function ReviewsTab({ person, packages, lookup, now }: { person: Person; packages: PackageSummary[]; lookup: Lookup; now: Date }) {
  const queue = reviewQueue(packages, person.id).filter((p) => p.responsibleManagerId === person.id)
  return (
    <Section
      title={`${queue.length} awaiting review`}
      description={`Submitted packages ${person.name} is responsible for, oldest submission first. Any manager can review them.`}
      flush
    >
      {queue.length ? (
        <PackageTable
          lookup={lookup}
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

function RoundsTab({ person, lookup, params, set, decisions }: TabProps & { lookup: Lookup; decisions: boolean }) {
  const uid = useId()
  const outcome = (params.get('outcome') ?? '') as SubmissionOutcome | ''
  const days = Number(params.get('days') ?? '') || undefined
  // Paged from the server, newest first, with the exact total.
  const rounds = useRounds({ personId: person.id, as: decisions ? 'decider' : 'submitter', outcome: outcome || undefined, days })
  const rows = pagedRows(rounds.data)
  const total = pagedTotal(rounds.data)
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
        title={rounds.isPending ? 'Rounds' : `${total} ${total === 1 ? 'round' : 'rounds'}`}
        description={decisions ? `Rounds ${person.name} approved or sent back for changes` : `Every round ${person.name} submitted, newest first`}
        flush
      >
        {rounds.data === undefined ? (
          <PageStatus error={rounds.error?.message} retry={() => void rounds.refetch()} />
        ) : (
          <>
            <SubmissionTable
              lookup={lookup}
              submissions={rows}
              caption={decisions ? `${person.name}’s review decisions` : `${person.name}’s submission rounds`}
              person={decisions ? 'submitter' : 'decider'}
              emptyText={outcome || days ? 'Try another outcome or period.' : undefined}
            />
            <LoadMore shown={rows.length} total={total} loading={rounds.isFetchingNextPage} onMore={() => void rounds.fetchNextPage()} noun="rounds" />
          </>
        )}
      </Section>
    </>
  )
}

function AttendanceTab({ person, params, set, now }: TabProps & { now: Date }) {
  const uid = useId()
  const days = Number(params.get('days') ?? '') || 14
  const sessions = usePersonAttendance(person.id, days)
  const rows = sessions.data ?? []
  const autoClosed = rows.filter((s) => s.autoClosed).length

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
        title={sessions.data ? `${formatDuration(totalDurationMs(rows, now))} over ${rows.length} ${rows.length === 1 ? 'session' : 'sessions'}` : 'Attendance'}
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
        {sessions.data === undefined ? (
          <PageStatus error={sessions.error?.message} retry={() => void sessions.refetch()} />
        ) : (
          <AttendanceTable sessions={rows} now={now} caption={`${person.name}’s attendance, last ${days} days`} />
        )}
      </Section>
    </>
  )
}
