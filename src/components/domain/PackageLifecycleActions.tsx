import { Archive, ArchiveRestore, Pause, Play, Trash2, Undo2, X, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { api } from '../../data/api'
import type { Lookup } from '../../data/selectors'
import type { ActionResult, PackageStatus, WorkPackage } from '../../data/types'
import { useBack } from '../../lib/back'
import { STATUS_META } from '../../lib/status'
import { buttonClasses, fieldAria, inputClasses, type ButtonVariant } from '../../lib/styles'
import { Dialog } from '../ui/Dialog'
import { Field } from '../ui/Field'
import { useToast } from '../ui/toast-context'

type Action = 'resume' | 'reopen' | 'unarchive' | 'hold' | 'archive' | 'cancel' | 'delete'

/** What a manager can do from each status (PRD §5); the database enforces the same table. */
const AVAILABLE: Record<PackageStatus, Action[]> = {
  assigned: ['hold', 'cancel', 'delete'],
  in_progress: ['hold', 'cancel'],
  submitted: ['hold', 'cancel'],
  client_review: ['hold', 'cancel'],
  apply_feedback: ['hold', 'cancel'],
  on_hold: ['resume', 'cancel'],
  completed: ['reopen', 'archive'],
  cancelled: ['archive'],
  archived: ['unarchive'],
}

interface ActionSpec {
  label: string
  icon: LucideIcon
  variant: ButtonVariant
  title: string
  confirm: string
  busy: string
  /** Label of the optional note, for actions that take one. */
  note?: { label: string; placeholder: string }
  describe: (names: { editor: string; back: string }) => string
  done: (names: { editor: string; code: string }) => string
  run: (pkg: WorkPackage, note: string) => Promise<ActionResult<unknown>>
}

const ACTIONS: Record<Action, ActionSpec> = {
  resume: {
    label: 'Resume',
    icon: Play,
    variant: 'primary',
    title: 'Resume this package?',
    confirm: 'Resume',
    busy: 'Resuming…',
    describe: ({ editor, back }) => `It goes back to ${back}, and ${editor} will be notified.`,
    done: ({ editor }) => `Resumed. ${editor} has been notified.`,
    run: (pkg) => api.resumePackage(pkg.id),
  },
  reopen: {
    label: 'Reopen for changes',
    icon: Undo2,
    variant: 'primary',
    title: 'Reopen this package?',
    confirm: 'Reopen for changes',
    busy: 'Reopening…',
    note: { label: 'Note for the editor', placeholder: 'e.g. The client wants a 15s cutdown too.' },
    describe: ({ editor }) =>
      `It moves to Apply Feedback so ${editor} can submit a new round. The approved round stays in the history. If the deadline has passed, edit the package to set a new one.`,
    done: ({ editor }) => `Reopened. ${editor} has been notified.`,
    run: (pkg, note) => api.reopenPackage(pkg.id, note),
  },
  unarchive: {
    label: 'Unarchive',
    icon: ArchiveRestore,
    variant: 'primary',
    title: 'Unarchive this package?',
    confirm: 'Unarchive',
    busy: 'Unarchiving…',
    describe: ({ back }) => `It goes back to ${back}.`,
    done: () => 'Unarchived',
    run: (pkg) => api.unarchivePackage(pkg.id),
  },
  hold: {
    label: 'Put on hold',
    icon: Pause,
    variant: 'secondary',
    title: 'Put this package on hold?',
    confirm: 'Put on hold',
    busy: 'Putting on hold…',
    note: { label: 'Reason', placeholder: 'e.g. The client paused the campaign.' },
    describe: ({ editor }) =>
      `${editor} will be notified and can’t submit until you resume it. It won’t count as overdue or toward workload while it’s on hold.`,
    done: ({ editor }) => `On hold. ${editor} has been notified.`,
    run: (pkg, note) => api.holdPackage(pkg.id, note),
  },
  archive: {
    label: 'Archive',
    icon: Archive,
    variant: 'secondary',
    title: 'Archive this package?',
    confirm: 'Archive',
    busy: 'Archiving…',
    describe: () => 'It can’t be edited while archived. It stays in finished lists and History, and you can unarchive it any time.',
    done: () => 'Archived',
    run: (pkg) => api.archivePackage(pkg.id),
  },
  cancel: {
    label: 'Cancel package',
    icon: X,
    variant: 'danger',
    title: 'Cancel this package?',
    confirm: 'Cancel package',
    busy: 'Cancelling…',
    note: { label: 'Reason', placeholder: 'e.g. The client dropped this spot.' },
    describe: ({ editor }) => `${editor} will be notified and no more work happens on it. Every round and its history are kept. This can’t be undone.`,
    done: ({ editor }) => `Cancelled. ${editor} has been notified.`,
    run: (pkg, note) => api.cancelPackage(pkg.id, note),
  },
  delete: {
    label: 'Delete package',
    icon: Trash2,
    variant: 'danger',
    title: 'Delete this package permanently?',
    confirm: 'Delete permanently',
    busy: 'Deleting…',
    describe: ({ editor }) =>
      `Nobody has started it, so nothing is lost but the package itself. ${editor} will be notified. This can’t be undone. Once work starts, cancel instead.`,
    done: ({ code }) => `${code} deleted`,
    run: (pkg) => api.deletePackage(pkg.id),
  },
}

/** Managers: hold, resume, cancel, archive, unarchive, reopen, or delete, depending on the status. */
export function PackageLifecycleActions({ lookup, pkg }: { lookup: Lookup; pkg: WorkPackage }) {
  const toast = useToast()
  // After a delete, return to the list the package was opened from (filters included).
  const back = useBack({ to: '/packages', label: 'Packages' })
  const [pending, setPending] = useState<Action | null>(null)
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  const names = {
    editor: lookup.personName(pkg.editorId),
    code: pkg.code,
    back: pkg.previousStatus ? STATUS_META[pkg.previousStatus].label : 'its previous status',
  }
  const spec = pending ? ACTIONS[pending] : null
  const close = () => {
    setPending(null)
    setNote('')
    setNoteError(undefined)
  }

  const confirm = async () => {
    if (!pending || !spec) return
    setBusy(true)
    const result = await spec.run(pkg, note)
    setBusy(false)
    if (!result.ok) {
      if (result.fieldErrors?.note) setNoteError(result.fieldErrors.note)
      else {
        close()
        toast.show(result.error, 'error')
      }
      return
    }
    close()
    toast.show(spec.done(names))
    if (pending === 'delete') back.go()
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {AVAILABLE[pkg.status].map((action) => {
          const { label, icon: Icon, variant } = ACTIONS[action]
          return (
            <li key={action}>
              <button
                type="button"
                aria-haspopup="dialog"
                className={buttonClasses(variant, 'md', 'w-full')}
                disabled={busy}
                onClick={() => setPending(action)}
              >
                <Icon aria-hidden className="size-4" />
                {label}
              </button>
            </li>
          )
        })}
      </ul>

      <Dialog
        open={spec !== null}
        onClose={close}
        title={spec?.title ?? ''}
        description={spec?.describe(names)}
        footer={
          spec && (
            <>
              <button type="button" className={buttonClasses('secondary')} onClick={close}>
                Keep as is
              </button>
              <button
                type="button"
                disabled={busy}
                className={buttonClasses(spec.variant === 'danger' ? 'danger' : 'primary')}
                onClick={() => void confirm()}
              >
                {busy ? spec.busy : spec.confirm}
              </button>
            </>
          )
        }
      >
        {spec?.note && (
          <Field id="lifecycle-note" label={spec.note.label} error={noteError} hint={`${note.length}/500 characters`}>
            <textarea
              {...fieldAria('lifecycle-note', { error: noteError, hasHint: true })}
              rows={3}
              value={note}
              maxLength={500}
              onChange={(e) => {
                setNote(e.target.value)
                setNoteError(undefined)
              }}
              placeholder={spec.note.placeholder}
              className={inputClasses(Boolean(noteError))}
            />
          </Field>
        )}
      </Dialog>
    </>
  )
}
