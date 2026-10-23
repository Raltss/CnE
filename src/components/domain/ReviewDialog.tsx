import { Check, Clapperboard, ExternalLink, RotateCcw, Truck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../data/api'
import { completionBlocker, type Lookup } from '../../data/selectors'
import type { PackageSummary } from '../../data/types'
import { buttonClasses, fieldAria, inputClasses } from '../../lib/styles'
import { formatDateTime } from '../../lib/time'
import { Callout } from '../ui/Callout'
import { Dialog } from '../ui/Dialog'
import { Field } from '../ui/Field'
import { useToast } from '../ui/toast-context'
import { APPROVE_COPY, type ApproveMode } from './approve'
import { ApproveOptions } from './ApproveOptions'
import { DeadlineBadge } from './DeadlineBadge'
import { LinkField } from './LinkField'

type Mode = 'review' | 'approve' | 'feedback'

interface ReviewDialogProps {
  lookup: Lookup
  /** The submitted package to review (with its latest round); the dialog is closed when null. */
  pkg: PackageSummary | null
  now: Date
  onClose: () => void
}

/**
 * Quick review without leaving the dashboard: check the latest round's links, then
 * approve (send to the client, or complete) or mark Apply Feedback. One dialog that
 * steps between views, so there are never two modals stacked.
 */
export function ReviewDialog({ lookup, pkg, now, onClose }: ReviewDialogProps) {
  const toast = useToast()
  const [mode, setMode] = useState<Mode>('review')
  const [approveMode, setApproveMode] = useState<ApproveMode>('client')
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  const close = () => {
    setMode('review')
    setApproveMode('client')
    setNote('')
    setNoteError(undefined)
    onClose()
  }

  if (!pkg) return <Dialog open={false} onClose={close} title="Review" />

  const latest = pkg.latest
  // Without a delivery link the round can still go to the client, but not be completed.
  const noDelivery = completionBlocker(latest)
  const editorName = lookup.personName(pkg.editorId)
  const copy = APPROVE_COPY[approveMode]

  const approve = async () => {
    setBusy(true)
    const r = approveMode === 'client' ? await api.sendToClient(pkg.id) : await api.approve(pkg.id)
    setBusy(false)
    toast.show(r.ok ? copy.done(editorName) : r.error, r.ok ? 'success' : 'error')
    if (r.ok) close()
  }
  const sendFeedback = async () => {
    setBusy(true)
    const r = await api.requestFeedback(pkg.id, note)
    setBusy(false)
    if (!r.ok) {
      setNoteError(r.fieldErrors?.note ?? r.error)
      return
    }
    toast.show(`Marked Apply Feedback. ${editorName} has been notified.`)
    close()
  }

  if (mode === 'approve')
    return (
      <Dialog
        open
        onClose={close}
        title={`Approve Round ${latest?.round ?? 1}`}
        description={`${pkg.title} · ${editorName} will be notified.`}
        footer={
          <>
            <button key="back" type="button" className={buttonClasses('secondary')} onClick={() => setMode('review')}>
              Back
            </button>
            <button key="confirm" type="button" disabled={busy} className={buttonClasses('primary')} onClick={approve}>
              <Check aria-hidden className="size-4" />
              {busy ? copy.busy : copy.confirm}
            </button>
          </>
        }
      >
        <ApproveOptions latest={latest} value={approveMode} onChange={setApproveMode} />
      </Dialog>
    )

  if (mode === 'feedback')
    return (
      <Dialog
        open
        onClose={close}
        title="Mark Apply Feedback"
        description={`${editorName} will be notified to revise and resubmit. Keep detailed comments in Frame.io.`}
        footer={
          <>
            <button key="back" type="button" className={buttonClasses('secondary')} onClick={() => setMode('review')}>
              Back
            </button>
            <button key="send" type="button" disabled={busy} className={buttonClasses('primary')} onClick={sendFeedback}>
              {busy ? 'Sending…' : 'Send back for changes'}
            </button>
          </>
        }
      >
        <Field id="review-note" label="Short note for the editor" error={noteError} hint={`${note.length}/500 characters`}>
          <textarea
            {...fieldAria('review-note', { error: noteError, hasHint: true })}
            rows={3}
            autoFocus
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
    )

  return (
    <Dialog
      open
      onClose={close}
      title={pkg.title}
      description={lookup.productName(pkg.productId)}
      footer={
        <>
          <Link key="open" to={`/packages/${pkg.id}`} className={buttonClasses('ghost', 'md', 'sm:mr-auto')}>
            <ExternalLink aria-hidden className="size-4" />
            Open full package
          </Link>
          {/* Keys force fresh buttons per view, so autoFocus restores focus after "Back". */}
          <button key="apply" type="button" className={buttonClasses('secondary')} onClick={() => setMode('feedback')}>
            <RotateCcw aria-hidden className="size-4" />
            Apply Feedback
          </button>
          <button key="approve" type="button" autoFocus aria-haspopup="dialog" className={buttonClasses('primary')} onClick={() => setMode('approve')}>
            <Check aria-hidden className="size-4" />
            Approve…
          </button>
        </>
      }
    >
      <dl className="grid grid-cols-2 gap-4 rounded-lg bg-surface-2 p-4 text-sm">
        <div>
          <dt className="text-xs font-semibold text-muted-fg">Submitted by</dt>
          <dd className="font-medium">{editorName}</dd>
          {latest && <dd className="text-xs text-muted-fg tabular-nums">Round {latest.round} · {formatDateTime(latest.submittedAt)}</dd>}
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted-fg">Final deadline</dt>
          <dd>
            <DeadlineBadge pkg={pkg} now={now} />
          </dd>
        </div>
      </dl>

      <div className="divide-y divide-border">
        <LinkField label="Review link" icon={Clapperboard} url={latest?.reviewLink ?? null} />
        <LinkField label="Delivery link" icon={Truck} url={latest?.deliveryLink ?? null} />
      </div>

      {noDelivery ? (
        <Callout tone="info" title="No delivery link yet">
          You can send this round to the client now. To complete the package, it needs a delivery link, which the editor can add from the package page.
        </Callout>
      ) : (
        <p className="text-sm text-muted-fg">Check the links above. Detailed comments go in Frame.io.</p>
      )}
    </Dialog>
  )
}
