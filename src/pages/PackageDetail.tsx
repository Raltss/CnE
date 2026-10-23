import {
  Archive,
  ArrowLeft,
  Check,
  ChevronRight,
  CircleCheck,
  FileText,
  Eye,
  Hourglass,
  Link2,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  SearchX,
  Send,
  ShieldAlert,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { ActivityTimeline } from '../components/domain/ActivityTimeline'
import { APPROVE_COPY, type ApproveMode } from '../components/domain/approve'
import { ApproveOptions } from '../components/domain/ApproveOptions'
import { AddDeliveryLinkForm, ClientDecisionActions } from '../components/domain/ClientReviewActions'
import { DeadlineBadge } from '../components/domain/DeadlineBadge'
import { ViewOnlyBanner } from '../components/domain/ViewOnlyBanner'
import { LinkField } from '../components/domain/LinkField'
import { PackageLifecycleActions } from '../components/domain/PackageLifecycleActions'
import { OverdueBadge, StatusBadge } from '../components/domain/StatusBadge'
import { SubmissionForm } from '../components/domain/SubmissionForm'
import { SubmissionHistory } from '../components/domain/SubmissionHistory'
import { Callout } from '../components/ui/Callout'
import { Dialog } from '../components/ui/Dialog'
import { EmptyState } from '../components/ui/EmptyState'
import { Field } from '../components/ui/Field'
import { PageStatus } from '../components/ui/PageStatus'
import { Section } from '../components/ui/Section'
import { useToast } from '../components/ui/toast-context'
import { api } from '../data/api'
import { useNow } from '../data/hooks'
import { pageStatus, useDirectory, usePackage } from '../data/queries'
import { clientRevisions, isOverdue, revisionSummary, type Lookup } from '../data/selectors'
import type { ActivityEvent, ActivityType, Person, Product, Submission, WorkPackage } from '../data/types'
import { HOME } from '../layout/nav'
import { backState, useBack } from '../lib/back'
import { STATUS_META } from '../lib/status'
import { buttonClasses, cardClasses, cx, fieldAria, inputClasses } from '../lib/styles'
import { formatDateTime } from '../lib/time'
import { useSession } from '../session/context'

export function PackageDetail() {
  const { id } = useParams()
  const now = useNow()
  const { me } = useSession()
  const detail = usePackage(id)
  const { lookup, products, queries } = useDirectory()
  // Back to the page that opened this one (e.g. the filtered Packages list), else the role's list.
  const back = useBack(me.role === 'editor' ? { to: HOME.editor, label: 'My work' } : { to: '/packages', label: 'Packages' })
  const location = useLocation()

  const status = pageStatus(detail, ...queries)
  if (status.pending || status.error) return <PageStatus {...status} />

  // RLS returns nothing for packages this person may not see (e.g. another editor's).
  if (!detail.data)
    return (
      <EmptyState
        icon={me.role === 'editor' ? ShieldAlert : SearchX}
        title={me.role === 'editor' ? 'Package not found, or not assigned to you' : 'Package not found'}
        tone="error"
        action={
          <Link to={back.to} onClick={back.onClick} className={buttonClasses('primary')}>
            Back to {back.label.toLowerCase()}
          </Link>
        }
      >
        {me.role === 'editor' ? 'Editors can open only their own packages. It may have been reassigned to another editor.' : 'The link may be wrong.'}
      </EmptyState>
    )

  const { pkg, rounds: roundList, activity } = detail.data
  const rounds = roundList.length
  const latest = roundList[0] ?? null
  const product = products.find((p) => p.id === pkg.productId)
  const revisions = clientRevisions(roundList, product?.includedRevisions ?? null)

  return (
    <>
      <Link to={back.to} onClick={back.onClick} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        {back.label}
      </Link>

      {me.role === 'admin' && (
        <ViewOnlyBanner>
          You can see this package as an admin, but only {lookup.personName(pkg.editorId)} and the managers can change it. Nothing you do here is done
          as them.
        </ViewOnlyBanner>
      )}

      <header className={cx(cardClasses, 'mb-5 p-4')}>
        <nav aria-label="Breadcrumb" className="text-xs text-muted-fg">
          <ol className="flex flex-wrap items-center gap-1">
            <li>{lookup.productName(pkg.productId)}</li>
            <li aria-hidden>
              <ChevronRight className="size-3" />
            </li>
            <li aria-current="page" className="tabular-nums">
              {pkg.code}
            </li>
          </ol>
        </nav>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{pkg.title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={pkg.status} />
            {isOverdue(pkg, now) && <OverdueBadge />}
            {me.role === 'manager' && pkg.status !== 'archived' && (
              <Link to={`/packages/${pkg.id}/edit`} state={backState(location, 'Package')} className={buttonClasses('secondary', 'sm')}>
                <Pencil aria-hidden className="size-4" />
                Edit
              </Link>
            )}
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm lg:grid-cols-5">
          <div>
            <dt className="text-xs font-semibold text-muted-fg">Editor</dt>
            <dd>{lookup.personName(pkg.editorId)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted-fg">Responsible manager</dt>
            <dd>{lookup.personName(pkg.responsibleManagerId)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted-fg">Final deadline</dt>
            <dd>
              <DeadlineBadge pkg={pkg} now={now} />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted-fg">Submission rounds</dt>
            <dd className="tabular-nums">{rounds || 'None yet'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted-fg">Client revisions</dt>
            <dd className={cx('flex items-center gap-1 tabular-nums', revisions.extra > 0 && 'font-semibold text-warning')}>
              {revisions.extra > 0 && <TriangleAlert aria-hidden className="size-4 shrink-0" />}
              {revisions.used === 0 && revisions.included === null ? 'None yet' : revisionSummary(revisions.used, revisions.included)}
            </dd>
          </div>
        </dl>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-5 lg:order-2">
          <Section title="Actions">
            <ActionPanel lookup={lookup} pkg={pkg} me={me} rounds={roundList} product={product} />
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-5 lg:order-1 lg:col-span-2">
          <LifecycleCallout pkg={pkg} activity={activity} lookup={lookup} />
          {pkg.status === 'apply_feedback' && latest?.outcome === 'feedback' && (
            <Callout tone="warning" title={`Feedback requested on Round ${latest.round}`}>
              {latest.feedbackNote ? (
                <>
                  <span className="font-semibold">{lookup.personName(latest.decidedById ?? '')}:</span> “{latest.feedbackNote}”
                </>
              ) : (
                'No note added.'
              )}{' '}
              Detailed comments are in Frame.io.
            </Callout>
          )}
          {pkg.status === 'apply_feedback' && latest?.outcome === 'client_feedback' && (
            <Callout tone="warning" title={`The client asked for changes on Round ${latest.round}`}>
              {latest.feedbackNote ? `“${latest.feedbackNote}”` : 'No note added.'}{' '}
              <span className="whitespace-nowrap">(Recorded by {lookup.personName(latest.clientDecidedById ?? '')})</span>
            </Callout>
          )}

          <Section title="Brief & references">
            <div className="divide-y divide-border">
              <LinkField label="Brief link" icon={FileText} url={pkg.briefLink || null} />
              {pkg.referenceLinks.length ? (
                pkg.referenceLinks.map((url, i) => (
                  <LinkField key={`${url}-${i}`} label={`Reference link ${i + 1}`} icon={Link2} url={url} />
                ))
              ) : (
                <LinkField label="Reference links" icon={Link2} url={null} emptyText="No reference links" />
              )}
            </div>
          </Section>

          <Section title="Deliverables & notes">
            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className="text-xs font-semibold tracking-wide text-muted-fg uppercase">Deliverables</dt>
                <dd className="mt-0.5 whitespace-pre-line">{pkg.deliverables || <span className="text-muted-fg italic">Not specified</span>}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold tracking-wide text-muted-fg uppercase">Description / notes</dt>
                <dd className="mt-0.5 whitespace-pre-line">{pkg.description || <span className="text-muted-fg italic">No notes</span>}</dd>
              </div>
            </dl>
          </Section>

          <Section title="Submission history" description="Every round is kept, newest first">
            <SubmissionHistory rounds={roundList} lookup={lookup} />
          </Section>

          <Section title="Activity">
            <ActivityTimeline events={activity} lookup={lookup} />
          </Section>
        </div>
      </div>
    </>
  )
}

function ActionPanel({ lookup, pkg, me, rounds, product }: { lookup: Lookup; pkg: WorkPackage; me: Person; rounds: Submission[]; product: Product | undefined }) {
  const toast = useToast()
  const [starting, setStarting] = useState(false)
  const latest = pkg.latest
  const nextRound = (latest?.round ?? 0) + 1
  const managerName = lookup.personName(pkg.responsibleManagerId)

  if (me.role === 'editor') {
    if (pkg.status === 'assigned')
      return (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-fg">Start work when you begin editing. Your managers will see the package as In Progress.</p>
          <button
            type="button"
            className={buttonClasses('primary', 'md', 'w-full')}
            disabled={starting}
            onClick={async () => {
              setStarting(true)
              const r = await api.startWork(pkg.id)
              setStarting(false)
              toast.show(r.ok ? 'Work started' : r.error, r.ok ? 'success' : 'error')
            }}
          >
            <Play aria-hidden className="size-4" />
            Start work
          </button>
        </div>
      )
    if (pkg.status === 'in_progress' || pkg.status === 'apply_feedback')
      return <SubmissionForm pkg={pkg} managerName={managerName} nextRound={nextRound} />
    // Waiting on a manager or the client; the final delivery link can still be added.
    if (pkg.status === 'submitted' || pkg.status === 'client_review')
      return (
        <div className="flex flex-col gap-4">
          {pkg.status === 'submitted' ? (
            <StatusNote icon={Hourglass} title={`Round ${latest?.round} is awaiting review`}>
              {managerName} was notified. You’ll get a notification when it’s approved or needs changes.
            </StatusNote>
          ) : (
            <StatusNote icon={Send} title={`Round ${latest?.round} is with the client`}>
              It was approved and sent to the client. You’ll get a notification when they approve it or ask for changes.
            </StatusNote>
          )}
          {!latest?.deliveryLink && <AddDeliveryLinkForm pkg={pkg} managerName={managerName} />}
        </div>
      )
    if (pkg.status === 'completed')
      return (
        <StatusNote icon={CircleCheck} title="Approved and completed">
          {pkg.completedAt && `Completed ${formatDateTime(pkg.completedAt)}.`} It stays in your History.
        </StatusNote>
      )
    if (pkg.status === 'on_hold')
      return (
        <StatusNote icon={Pause} title="On hold">
          {managerName} paused this package. You’ll be notified when it resumes.
        </StatusNote>
      )
    if (pkg.status === 'cancelled')
      return (
        <StatusNote icon={X} title="Cancelled">
          No more work is needed on this package. It stays in your History.
        </StatusNote>
      )
    if (pkg.status === 'archived')
      return (
        <StatusNote icon={Archive} title="Archived">
          It stays in your History.
        </StatusNote>
      )
    return <StatusNote icon={Hourglass} title="No actions available" />
  }

  if (me.role === 'admin')
    return (
      <StatusNote icon={Eye} title="View only">
        Admins can’t start, submit, review, or edit packages.{' '}
        <Link to={`/team/${pkg.editorId}`} className="font-semibold text-primary underline-offset-2 hover:underline">
          See {lookup.personName(pkg.editorId)}’s work
        </Link>{' '}
        or{' '}
        <Link to={`/team/${pkg.responsibleManagerId}`} className="font-semibold text-primary underline-offset-2 hover:underline">
          {managerName}’s
        </Link>
        .
      </StatusNote>
    )

  // Manager: review when submitted, then whatever the status allows (hold, cancel, reopen, …).
  const editorName = lookup.personName(pkg.editorId)
  const back = pkg.previousStatus ? STATUS_META[pkg.previousStatus].label : 'its previous status'
  const notes: Record<Exclude<WorkPackage['status'], 'submitted' | 'client_review'>, { icon: LucideIcon; title: string; text: string }> = {
    assigned: { icon: Hourglass, title: 'No review needed right now', text: `Waiting for ${editorName} to start work.` },
    in_progress: { icon: Hourglass, title: 'No review needed right now', text: `${editorName} is working on it. Review actions appear once it’s submitted.` },
    apply_feedback: { icon: Hourglass, title: 'No review needed right now', text: `Waiting for ${editorName} to resubmit.` },
    on_hold: { icon: Pause, title: 'On hold', text: `${editorName} can’t submit until you resume it. Resuming returns it to ${back}.` },
    completed: {
      icon: CircleCheck,
      title: 'Approved and completed',
      text: `${pkg.completedAt ? `Approved ${formatDateTime(pkg.completedAt)}. ` : ''}Reopen it to send it back to ${editorName} for changes.`,
    },
    cancelled: { icon: X, title: 'Cancelled', text: 'Nothing more happens on it. Archive it when it no longer needs to show in finished lists.' },
    archived: { icon: Archive, title: 'Archived', text: `It can’t be edited while archived. Unarchiving returns it to ${back}.` },
  }
  return (
    <div className="flex flex-col gap-4">
      {pkg.status === 'submitted' ? (
        <ReviewActions lookup={lookup} pkg={pkg} />
      ) : pkg.status === 'client_review' ? (
        <ClientDecisionActions lookup={lookup} pkg={pkg} rounds={rounds} product={product} />
      ) : (
        <StatusNote icon={notes[pkg.status].icon} title={notes[pkg.status].title}>
          {notes[pkg.status].text}
        </StatusNote>
      )}
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <h3 className="text-xs font-semibold tracking-wide text-muted-fg uppercase">Manage package</h3>
        <PackageLifecycleActions lookup={lookup} pkg={pkg} />
      </div>
    </div>
  )
}

/** Why a package is on hold, cancelled, or reopened: the latest matching entry in its history. */
const LIFECYCLE_CALLOUTS: Partial<Record<WorkPackage['status'], { type: ActivityType; title: string; tone: 'info' | 'warning' }>> = {
  on_hold: { type: 'held', title: 'On hold', tone: 'warning' },
  cancelled: { type: 'cancelled', title: 'Cancelled', tone: 'info' },
  apply_feedback: { type: 'reopened', title: 'Reopened for changes', tone: 'warning' },
}

function LifecycleCallout({ pkg, activity, lookup }: { pkg: WorkPackage; activity: ActivityEvent[]; lookup: Lookup }) {
  const spec = LIFECYCLE_CALLOUTS[pkg.status]
  // Apply Feedback after a reopen only: the latest round is the approved one.
  if (!spec || (pkg.status === 'apply_feedback' && pkg.latest?.outcome !== 'approved')) return null
  const event = activity.find((e) => e.type === spec.type)
  if (!event) return null
  return (
    <Callout tone={spec.tone} title={spec.title}>
      {event.message} <span className="whitespace-nowrap">({lookup.personName(event.actorId)}, {formatDateTime(event.at)})</span>
    </Callout>
  )
}

function StatusNote({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-fg" />
      <div>
        <p className="font-semibold">{title}</p>
        {children && <p className="mt-0.5 text-sm text-muted-fg">{children}</p>}
      </div>
    </div>
  )
}

function ReviewActions({ lookup, pkg }: { lookup: Lookup; pkg: WorkPackage }) {
  const toast = useToast()
  const latest = pkg.latest
  const editorName = lookup.personName(pkg.editorId)
  const [approveOpen, setApproveOpen] = useState(false)
  const [approveMode, setApproveMode] = useState<ApproveMode>('client')
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  const copy = APPROVE_COPY[approveMode]
  const approve = async () => {
    setBusy(true)
    const r = approveMode === 'client' ? await api.sendToClient(pkg.id) : await api.approve(pkg.id)
    setBusy(false)
    setApproveOpen(false)
    toast.show(r.ok ? copy.done(editorName) : r.error, r.ok ? 'success' : 'error')
  }
  const sendFeedback = async () => {
    setBusy(true)
    const r = await api.requestFeedback(pkg.id, note)
    setBusy(false)
    if (!r.ok) {
      setNoteError(r.fieldErrors?.note ?? r.error)
      return
    }
    setFeedbackOpen(false)
    setNote('')
    toast.show(`Marked Apply Feedback. ${lookup.personName(pkg.editorId)} has been notified.`)
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        Round {latest?.round} submitted by <span className="font-semibold">{lookup.personName(pkg.editorId)}</span>
        {latest && <span className="block text-xs text-muted-fg tabular-nums">{formatDateTime(latest.submittedAt)}</span>}
      </p>
      <p className="text-xs text-muted-fg">Check the links in Submission history. Detailed comments go in Frame.io.</p>
      <button type="button" aria-haspopup="dialog" className={buttonClasses('primary', 'md', 'w-full')} disabled={busy} onClick={() => setApproveOpen(true)}>
        <Check aria-hidden className="size-4" />
        Approve…
      </button>
      <button type="button" className={buttonClasses('secondary', 'md', 'w-full')} onClick={() => setFeedbackOpen(true)}>
        <RotateCcw aria-hidden className="size-4" />
        Apply Feedback
      </button>

      <Dialog
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        title={`Approve Round ${latest?.round ?? 1}`}
        description={`${pkg.title} · ${editorName} will be notified.`}
        footer={
          <>
            <button type="button" className={buttonClasses('secondary')} onClick={() => setApproveOpen(false)}>
              Cancel
            </button>
            <button type="button" disabled={busy} className={buttonClasses('primary')} onClick={() => void approve()}>
              <Check aria-hidden className="size-4" />
              {busy ? copy.busy : copy.confirm}
            </button>
          </>
        }
      >
        <ApproveOptions latest={latest} value={approveMode} onChange={setApproveMode} />
      </Dialog>
      <Dialog
        open={feedbackOpen}
        onClose={() => {
          setFeedbackOpen(false)
          setNoteError(undefined)
        }}
        title="Mark Apply Feedback"
        description={`${lookup.personName(pkg.editorId)} will be notified to revise and resubmit. Keep detailed comments in Frame.io.`}
        footer={
          <>
            <button type="button" className={buttonClasses('secondary')} onClick={() => setFeedbackOpen(false)}>
              Cancel
            </button>
            <button type="button" disabled={busy} className={buttonClasses('primary')} onClick={sendFeedback}>
              {busy ? 'Sending…' : 'Send back for changes'}
            </button>
          </>
        }
      >
        <Field id="feedback-note" label="Short note for the editor" error={noteError} hint={`${note.length}/500 characters`}>
          <textarea
            {...fieldAria('feedback-note', { error: noteError, hasHint: true })}
            rows={3}
            value={note}
            maxLength={500}
            onChange={(e) => {
              setNote(e.target.value)
              setNoteError(undefined)
            }}
            placeholder="e.g. See Frame.io comments at 0:12 and 0:40."
            className={inputClasses(Boolean(noteError))}
          />
        </Field>
      </Dialog>
    </div>
  )
}
