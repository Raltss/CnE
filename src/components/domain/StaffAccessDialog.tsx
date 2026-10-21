import { ShieldCheck } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { accessOf, isActive, staffActivityFor } from '../../data/selectors'
import { api } from '../../data/store'
import type { AppState, AssignableRole, Person, StaffAccount } from '../../data/types'
import { roleChangeBlocker } from '../../data/workflow'
import { ROLE_META } from '../../lib/status'
import { buttonClasses, cx } from '../../lib/styles'
import { Callout } from '../ui/Callout'
import { Dialog } from '../ui/Dialog'
import { useToast } from '../ui/toast-context'
import { StaffActivityList } from './StaffActivityList'
import { AccessBadge, RoleBadge } from './StatusBadge'

const ROLE_HELP: Record<AssignableRole, string> = {
  manager: 'Creates and assigns packages, reviews submissions, and sees all work and attendance.',
  editor: 'Works on the packages assigned to them, submits links, and clocks in and out.',
}

function RolePicker({ value, onChange, current }: { value: AssignableRole; onChange: (r: AssignableRole) => void; current?: AssignableRole }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Role</legend>
      {(['manager', 'editor'] as const).map((role) => {
        const Icon = ROLE_META[role].icon
        return (
          <label
            key={role}
            className={cx(
              'flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors duration-150',
              value === role ? 'border-primary bg-primary/5' : 'border-border-strong hover:bg-surface-2',
            )}
          >
            <input
              type="radio"
              name="staff-role"
              value={role}
              checked={value === role}
              onChange={() => onChange(role)}
              className="mt-1 size-4 accent-primary"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <Icon aria-hidden className="size-4" />
                {ROLE_META[role].label}
                {current === role && <span className="text-xs font-normal text-muted-fg">(current)</span>}
              </span>
              <span className="mt-0.5 block text-xs text-muted-fg">{ROLE_HELP[role]}</span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

interface StaffAccessDialogProps {
  state: AppState
  /** The account being managed; null closes the dialog. Re-key per account so choices reset. */
  account: StaffAccount | null
  me: Person
  onClose: () => void
}

/**
 * Approve, change role, deactivate, or reactivate one account. Every change
 * runs as the signed-in admin and is recorded in the account history.
 */
export function StaffAccessDialog({ state, account, me, onClose }: StaffAccessDialogProps) {
  const toast = useToast()
  const initialRole: AssignableRole = account?.role === 'manager' ? 'manager' : 'editor'
  const [role, setRole] = useState<AssignableRole>(initialRole)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!account) return <Dialog open={false} onClose={onClose} title="" />

  const access = accessOf(account)
  const first = account.name.split(' ')[0]
  const history = staffActivityFor(state, account.id).slice(0, 3)
  const locked = account.id === me.id ? 'You can’t change your own role or access.' : account.role === 'admin' ? 'Admin accounts are managed in the Supabase SQL editor, not in the app.' : null
  const blocker = access !== 'pending' && account.role !== role ? roleChangeBlocker(state, account) : null
  const openWork = state.packages.filter((p) => isActive(p) && (p.editorId === account.id || p.responsibleManagerId === account.id)).length

  const run = async (command: () => ReturnType<typeof api.approveAccount>, success: string) => {
    setBusy(true)
    setError(null)
    const r = await command()
    setBusy(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    toast.show(success)
    onClose()
  }

  const cancel = (
    <button type="button" className={buttonClasses('secondary')} onClick={onClose}>
      Cancel
    </button>
  )
  let body: ReactNode
  let footer: ReactNode = (
    <button type="button" className={buttonClasses('secondary')} onClick={onClose}>
      Close
    </button>
  )

  if (locked) {
    body = <Callout tone="info" title="No changes here">{locked}</Callout>
  } else if (confirmDeactivate) {
    body = (
      <>
        <p className="text-sm">
          {account.name} loses access immediately. Their packages, submission rounds, attendance, and history stay, and you can reactivate the account later.
        </p>
        {openWork > 0 && (
          <Callout tone="warning" title={`${openWork} open ${openWork === 1 ? 'package' : 'packages'}`}>
            Ask a manager to reassign them, or make another manager responsible, so the work doesn’t stall.
          </Callout>
        )}
      </>
    )
    footer = (
      <>
        <button type="button" className={buttonClasses('secondary')} onClick={() => setConfirmDeactivate(false)}>
          Back
        </button>
        <button
          type="button"
          disabled={busy}
          className={buttonClasses('danger')}
          onClick={() => run(() => api.deactivateAccount(me.id, account.id), `${account.name} was deactivated`)}
        >
          {busy ? 'Deactivating…' : `Deactivate ${first}`}
        </button>
      </>
    )
  } else if (access === 'pending') {
    body = (
      <>
        <p className="text-sm text-muted-fg">{first} can sign in but can’t see any work until you approve the account and choose a role.</p>
        <RolePicker value={role} onChange={setRole} />
      </>
    )
    footer = (
      <>
        {cancel}
        <button
          type="button"
          disabled={busy}
          className={buttonClasses('primary')}
          onClick={() => run(() => api.approveAccount(me.id, account.id, role), `${account.name} is now an active ${role}`)}
        >
          {busy ? 'Approving…' : `Approve as ${ROLE_META[role].label.toLowerCase()}`}
        </button>
      </>
    )
  } else if (access === 'active') {
    body = (
      <>
        <RolePicker value={role} onChange={setRole} current={initialRole} />
        {blocker && (
          <Callout tone="warning" title="Can’t change the role yet">
            {blocker}
          </Callout>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
          <p className="text-sm">
            <span className="font-semibold">Remove access</span>
            <span className="block text-xs text-muted-fg">History is kept. You can reactivate later.</span>
          </p>
          <button type="button" className={buttonClasses('danger', 'sm')} onClick={() => setConfirmDeactivate(true)}>
            Deactivate…
          </button>
        </div>
      </>
    )
    footer = (
      <>
        {cancel}
        <button
          type="button"
          disabled={busy || role === initialRole || Boolean(blocker)}
          className={buttonClasses('primary')}
          onClick={() => run(() => api.changeStaffRole(me.id, account.id, role), `${account.name} is now ${role === 'editor' ? 'an editor' : 'a manager'}`)}
        >
          {busy ? 'Saving…' : role === initialRole ? 'Choose a new role' : `Change to ${ROLE_META[role].label.toLowerCase()}`}
        </button>
      </>
    )
  } else {
    body = (
      <p className="text-sm text-muted-fg">
        {first} can’t see any work right now. Reactivating restores access as {account.role === 'editor' ? 'an editor' : 'a manager'}.
      </p>
    )
    footer = (
      <>
        {cancel}
        <button
          type="button"
          disabled={busy}
          className={buttonClasses('primary')}
          onClick={() => run(() => api.reactivateAccount(me.id, account.id), `${account.name} was reactivated`)}
        >
          {busy ? 'Reactivating…' : `Reactivate ${first}`}
        </button>
      </>
    )
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={confirmDeactivate ? `Deactivate ${account.name}?` : account.name}
      description={
        <span className="flex flex-wrap items-center gap-1.5">
          <span>{account.email}</span>
          <RoleBadge role={account.role} />
          <AccessBadge account={account} />
        </span>
      }
      footer={footer}
    >
      {body}
      {error && (
        <Callout tone="danger" title="That didn’t work">
          {error}
        </Callout>
      )}
      {!locked && (
        <p className="flex items-center gap-1.5 text-xs text-muted-fg">
          <ShieldCheck aria-hidden className="size-3.5 shrink-0" />
          Recorded in the account history as done by you ({me.name}).
        </p>
      )}
      {!confirmDeactivate && history.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wide text-muted-fg uppercase">Recent history</p>
          <div className="-mx-5 border-y border-border">
            <StaffActivityList state={state} entries={history} label={`${account.name}’s recent account history`} />
          </div>
        </div>
      )}
    </Dialog>
  )
}
