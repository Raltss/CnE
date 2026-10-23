import { CircleCheck, MessageSquareReply, Truck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { api } from '../../data/api'
import { clientRevisions, completionBlocker, revisionSummary, type Lookup } from '../../data/selectors'
import type { Product, Submission, WorkPackage } from '../../data/types'
import { buttonClasses, fieldAria, inputClasses } from '../../lib/styles'
import { formatDateTime } from '../../lib/time'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Dialog } from '../ui/Dialog'
import { Field } from '../ui/Field'
import { useToast } from '../ui/toast-context'

interface ClientDecisionProps {
  lookup: Lookup
  pkg: WorkPackage
  /** Every round, newest first (the latest is the one with the client). */
  rounds: Submission[]
  product: Product | undefined
}

/**
 * Managers, while the package is With Client: record what the client decided. Clients
 * don't sign in; the decision comes by email or in Frame.io and a manager records it here.
 */
export function ClientDecisionActions({ lookup, pkg, rounds, product }: ClientDecisionProps) {
  const toast = useToast()
  const [approving, setApproving] = useState(false)
  const [changesOpen, setChangesOpen] = useState(false)
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  const latest = rounds[0] ?? null
  const editorName = lookup.personName(pkg.editorId)
  const blocker = completionBlocker(pkg.latest)
  const { used, included } = clientRevisions(rounds, product?.includedRevisions ?? null)
  const next = used + 1
  const overNext = included !== null && next > included

  const approve = async () => {
    setApproving(false)
    setBusy(true)
    const r = await api.recordClientApproval(pkg.id)
    setBusy(false)
    toast.show(r.ok ? `Client approval recorded. ${pkg.title} is completed and ${editorName} has been notified.` : r.error, r.ok ? 'success' : 'error')
  }
  const sendChanges = async () => {
    setBusy(true)
    const r = await api.recordClientFeedback(pkg.id, note)
    setBusy(false)
    if (!r.ok) {
      setNoteError(r.fieldErrors?.note ?? r.error)
      return
    }
    setChangesOpen(false)
    setNote('')
    toast.show(`Client changes recorded. ${editorName} has been notified.`)
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        Round {latest?.round} is with the client
        {latest?.sentToClientAt && (
          <span className="block text-xs text-muted-fg tabular-nums">
            Sent {formatDateTime(latest.sentToClientAt)} by {lookup.personName(latest.decidedById ?? '')}
          </span>
        )}
      </p>
      <p className="text-xs text-muted-fg">
        Client revisions so far: <span className="font-semibold text-fg tabular-nums">{revisionSummary(used, included)}</span>
      </p>
      <button
        type="button"
        aria-haspopup="dialog"
        className={buttonClasses('primary', 'md', 'w-full')}
        disabled={Boolean(blocker) || busy}
        aria-describedby={blocker ? 'client-approve-blocker' : undefined}
        onClick={() => setApproving(true)}
      >
        <CircleCheck aria-hidden className="size-4" />
        Client approved
      </button>
      {blocker && (
        <p id="client-approve-blocker" className="text-xs font-medium text-warning">
          {blocker}
        </p>
      )}
      <button type="button" aria-haspopup="dialog" disabled={busy} className={buttonClasses('secondary', 'md', 'w-full')} onClick={() => setChangesOpen(true)}>
        <MessageSquareReply aria-hidden className="size-4" />
        Client wants changes
      </button>

      <ConfirmDialog
        open={approving}
        title="Record the client’s approval?"
        description={`Round ${latest?.round} will be marked approved and ${pkg.title} Completed. ${editorName} will be notified.`}
        confirmLabel="Record approval"
        onConfirm={() => void approve()}
        onCancel={() => setApproving(false)}
      />
      <Dialog
        open={changesOpen}
        onClose={() => {
          setChangesOpen(false)
          setNoteError(undefined)
        }}
        title="Record the client’s changes"
        description={
          <>
            The package goes back to {editorName} as Apply Feedback. This is client revision {next}
            {included !== null && (overNext ? `, ${next - included} over the ${included} included with ${product?.name}` : ` of the ${included} included`)}.
          </>
        }
        footer={
          <>
            <button type="button" className={buttonClasses('secondary')} onClick={() => setChangesOpen(false)}>
              Cancel
            </button>
            <button type="button" disabled={busy} className={buttonClasses('primary')} onClick={() => void sendChanges()}>
              {busy ? 'Sending…' : 'Send back for changes'}
            </button>
          </>
        }
      >
        <Field id="client-note" label="What the client asked for" error={noteError} hint={`${note.length}/500 characters. Detailed comments stay in Frame.io.`}>
          <textarea
            {...fieldAria('client-note', { error: noteError, hasHint: true })}
            rows={3}
            value={note}
            maxLength={500}
            onChange={(e) => {
              setNote(e.target.value)
              setNoteError(undefined)
            }}
            placeholder="e.g. Make the logo bigger in the end card."
            className={inputClasses(Boolean(noteError))}
          />
        </Field>
      </Dialog>
    </div>
  )
}

/** Editors: add the final delivery link to the latest round when it has none yet. */
export function AddDeliveryLinkForm({ pkg, managerName }: { pkg: WorkPackage; managerName: string }) {
  const toast = useToast()
  const [link, setLink] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const round = pkg.latest?.round ?? 1

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    const r = await api.addDeliveryLink(pkg.id, link)
    setBusy(false)
    if (!r.ok) {
      setError(r.fieldErrors?.link ?? r.error)
      document.getElementById('delivery-link')?.focus()
      return
    }
    toast.show(`Delivery link added. ${managerName} has been notified.`)
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3 border-t border-border pt-4">
      <Field
        id="delivery-link"
        label={`Delivery link for Round ${round}`}
        required
        error={error}
        hint="The final file (e.g. Google Drive). The package can’t be completed without it."
      >
        <div className="relative">
          <Truck aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-fg" />
          <input
            {...fieldAria('delivery-link', { error, hasHint: true })}
            type="url"
            inputMode="url"
            placeholder="https://drive.google.com/…"
            value={link}
            onChange={(e) => {
              setLink(e.target.value)
              setError(undefined)
            }}
            className={`${inputClasses(Boolean(error))} pl-9`}
          />
        </div>
      </Field>
      <button type="submit" disabled={busy} className={buttonClasses('primary', 'md', 'w-full')}>
        {busy ? 'Adding…' : 'Add delivery link'}
      </button>
    </form>
  )
}
