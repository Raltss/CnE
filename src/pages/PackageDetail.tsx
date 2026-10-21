import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleCheck,
  FileText,
  Eye,
  Hourglass,
  Link2,
  Pencil,
  Play,
  RotateCcw,
  SearchX,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { ActivityTimeline } from '../components/domain/ActivityTimeline'
import { DeadlineBadge } from '../components/domain/DeadlineBadge'
import { ViewOnlyBanner } from '../components/domain/ViewOnlyBanner'
import { LinkField } from '../components/domain/LinkField'
import { OverdueBadge, StatusBadge } from '../components/domain/StatusBadge'
import { SubmissionForm } from '../components/domain/SubmissionForm'
import { SubmissionHistory } from '../components/domain/SubmissionHistory'
import { Callout } from '../components/ui/Callout'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Dialog } from '../components/ui/Dialog'
import { EmptyState } from '../components/ui/EmptyState'
import { Field } from '../components/ui/Field'
import { PageStatus } from '../components/ui/PageStatus'
import { Section } from '../components/ui/Section'
import { useToast } from '../components/ui/toast-context'
import { api } from '../data/api'
import { useNow } from '../data/hooks'
import { pageStatus, useDirectory, usePackage } from '../data/queries'
import { approvalBlocker, isOverdue, type Lookup } from '../data/selectors'
import type { Person, WorkPackage } from '../data/types'
import { HOME } from '../layout/nav'
import { buttonClasses, cardClasses, cx, fieldAria, inputClasses } from '../lib/styles'
import { formatDateTime } from '../lib/time'
import { useSession } from '../session/context'

export function PackageDetail() {
  const { id } = useParams()
  const now = useNow()
  const { me } = useSession()
  const detail = usePackage(id)
  const { lookup, queries } = useDirectory()
  const back = me.role === 'editor' ? { to: HOME.editor, label: 'My work' } : { to: '/packages', label: 'Packages' }

  const status = pageStatus(detail, ...queries)
  if (status.pending || status.error) return <PageStatus {...status} />

  // RLS returns nothing for packages this person may not see (e.g. another editor's).
  if (!detail.data)
    return (
      <EmptyState
        icon={me.role === 'editor' ? ShieldAlert : SearchX}
        title={me.role === 'editor' ? 'Package not found, or not assigned to you' : 'Package not found'}
        tone="error"
        action={<Link to={back.to} className={buttonClasses('primary')}>Back to {back.label.toLowerCase()}</Link>}
      >
        {me.role === 'editor' ? 'Editors can open only their own packages. It may have been reassigned to another editor.' : 'The link may be wrong.'}
      </EmptyState>
    )

  const { pkg, rounds: roundList, activity } = detail.data
  const rounds = roundList.length
  const latest = roundList[0] ?? null

  return (
    <>
      <Link to={back.to} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
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
            {me.role === 'manager' && pkg.status !== 'completed' && (
              <Link to={`/packages/${pkg.id}/edit`} className={buttonClasses('secondary', 'sm')}>
                <Pencil aria-hidden className="size-4" />
                Edit
              </Link>
            )}
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm lg:grid-cols-4">
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
        </dl>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-5 lg:order-2">
          <Section title="Actions">
            <ActionPanel lookup={lookup} pkg={pkg} me={me} />
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-5 lg:order-1 lg:col-span-2">
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

function ActionPanel({ lookup, pkg, me }: { lookup: Lookup; pkg: WorkPackage; me: Person }) {
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
    if (pkg.status === 'submitted')
      return (
        <StatusNote icon={Hourglass} title={`Round ${latest?.round} is awaiting review`}>
          {managerName} was notified. You’ll get a notification when it’s approved or needs changes.
        </StatusNote>
      )
    if (pkg.status === 'completed')
      return (
        <StatusNote icon={CircleCheck} title="Approved and completed">
          {pkg.completedAt && `Completed ${formatDateTime(pkg.completedAt)}.`} It stays in your History.
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

  // Manager
  if (pkg.status === 'submitted') return <ReviewActions lookup={lookup} pkg={pkg} />
  const notes: Partial<Record<WorkPackage['status'], string>> = {
    assigned: `Waiting for ${lookup.personName(pkg.editorId)} to start work.`,
    in_progress: `${lookup.personName(pkg.editorId)} is working on it. Review actions appear once it’s submitted.`,
    apply_feedback: `Waiting for ${lookup.personName(pkg.editorId)} to resubmit after feedback.`,
    completed: pkg.completedAt ? `Approved ${formatDateTime(pkg.completedAt)}. Reopening is planned for a later milestone.` : 'Approved.',
  }
  return <StatusNote icon={pkg.status === 'completed' ? CircleCheck : Hourglass} title="No review needed right now">{notes[pkg.status]}</StatusNote>
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
  const blocker = approvalBlocker(latest)
  const [confirmApprove, setConfirmApprove] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  const approve = async () => {
    setConfirmApprove(false)
    setBusy(true)
    const r = await api.approve(pkg.id)
    setBusy(false)
    toast.show(r.ok ? `Approved. ${lookup.personName(pkg.editorId)} has been notified.` : r.error, r.ok ? 'success' : 'error')
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
      <button
        type="button"
        className={buttonClasses('primary', 'md', 'w-full')}
        disabled={Boolean(blocker) || busy}
        aria-describedby={blocker ? 'approve-blocker' : undefined}
        onClick={() => setConfirmApprove(true)}
      >
        <Check aria-hidden className="size-4" />
        Approve
      </button>
      {blocker && (
        <p id="approve-blocker" className="text-xs font-medium text-warning">
          {blocker}
        </p>
      )}
      <button type="button" className={buttonClasses('secondary', 'md', 'w-full')} onClick={() => setFeedbackOpen(true)}>
        <RotateCcw aria-hidden className="size-4" />
        Apply Feedback
      </button>

      <ConfirmDialog
        open={confirmApprove}
        title="Approve this package?"
        description={`Round ${latest?.round} will be approved and ${pkg.title} marked Completed. ${lookup.personName(pkg.editorId)} will be notified.`}
        confirmLabel="Approve and complete"
        onConfirm={approve}
        onCancel={() => setConfirmApprove(false)}
      />
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
