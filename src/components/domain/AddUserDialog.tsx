import { Copy, Eye, EyeOff, RefreshCw, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { api } from '../../data/api'
import type { Person, StaffAccount, StaffAccountInput } from '../../data/types'
import { PASSWORD_MAX, PASSWORD_MIN, validateStaffAccountInput } from '../../data/validation'
import { ROLE_META } from '../../lib/status'
import { buttonClasses, fieldAria, inputClasses } from '../../lib/styles'
import { Callout } from '../ui/Callout'
import { Dialog } from '../ui/Dialog'
import { Field } from '../ui/Field'
import { useToast } from '../ui/toast-context'
import { RolePicker } from './RolePicker'

const EMPTY: StaffAccountInput = { fullName: '', email: '', title: '', role: 'editor', password: '' }

// No look-alike characters (0/O, 1/l/I), so the password is easy to read out or retype.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

function generatePassword(length = 14) {
  return Array.from(crypto.getRandomValues(new Uint32Array(length)), (n) => ALPHABET[n % ALPHABET.length]).join('')
}

type FieldName = keyof StaffAccountInput
const FIELD_ORDER: FieldName[] = ['fullName', 'email', 'title', 'role', 'password']

interface AddUserDialogProps {
  open: boolean
  /** Existing accounts, to catch a duplicate email before sending. */
  accounts: StaffAccount[]
  me: Person
  onClose: () => void
}

/**
 * Admin: add a manager or editor with a temporary password. No email is sent;
 * the admin shares the password privately and the person chooses their own at
 * first sign-in. Re-key it per opening so the form starts empty.
 */
export function AddUserDialog({ open, accounts, me, onClose }: AddUserDialogProps) {
  const toast = useToast()
  const [form, setForm] = useState<StaffAccountInput>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState<StaffAccountInput | null>(null)

  const set = <K extends FieldName>(key: K, value: StaffAccountInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }
  const focusFirst = (found: Partial<Record<FieldName, string>>) => {
    const first = FIELD_ORDER.find((f) => found[f])
    if (first && first !== 'role') document.getElementById(`add-user-${first}`)?.focus()
  }

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    setFormError(null)
    const found = validateStaffAccountInput(accounts, form)
    setErrors(found)
    if (Object.keys(found).length) {
      focusFirst(found)
      return
    }
    setBusy(true)
    const result = await api.createStaffAccount(form)
    setBusy(false)
    if (!result.ok) {
      const fieldErrors = (result.fieldErrors ?? {}) as Partial<Record<FieldName, string>>
      setErrors(fieldErrors)
      if (Object.keys(fieldErrors).length) focusFirst(fieldErrors)
      else setFormError(result.error)
      return
    }
    setAdded(form)
    toast.show(`${form.fullName.trim()} was added as ${form.role === 'editor' ? 'an editor' : 'a manager'}`)
  }

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.show(`${label} copied`)
    } catch {
      toast.show('Couldn’t copy. Select the text and copy it manually.', 'error')
    }
  }

  if (added)
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title="Account ready"
        description={`${added.fullName.trim()} can sign in now as ${added.role === 'editor' ? 'an editor' : 'a manager'}.`}
        footer={
          <>
            <button
              type="button"
              className={buttonClasses('secondary')}
              onClick={() => {
                setAdded(null)
                setForm(EMPTY)
                setShowPassword(false)
              }}
            >
              Add another
            </button>
            <button type="button" className={buttonClasses('primary')} onClick={onClose}>
              Done
            </button>
          </>
        }
      >
        <Callout tone="warning" title="Share these privately, and copy the password now">
          It isn’t shown again. No email was sent. They’ll be asked to choose their own password the first time they sign in.
        </Callout>
        <dl className="flex flex-col divide-y divide-border rounded-md border border-border">
          {[
            { label: 'Email', value: added.email.trim().toLowerCase() },
            { label: 'Temporary password', value: added.password },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <dt className="text-xs font-semibold text-muted-fg">{row.label}</dt>
                <dd className="font-mono text-sm break-all">{row.value}</dd>
              </div>
              <button
                type="button"
                onClick={() => copy(row.label, row.value)}
                aria-label={`Copy ${row.label.toLowerCase()}`}
                className="flex size-10 shrink-0 items-center justify-center rounded-md text-muted-fg hover:bg-surface-2 hover:text-fg"
              >
                <Copy aria-hidden className="size-4" />
              </button>
            </div>
          ))}
        </dl>
      </Dialog>
    )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add user"
      description="Create a sign-in account for a manager or editor."
      footer={
        <>
          <button type="button" className={buttonClasses('secondary')} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="add-user-form" disabled={busy} className={buttonClasses('primary')}>
            {busy ? 'Adding…' : `Add ${ROLE_META[form.role].label.toLowerCase()}`}
          </button>
        </>
      }
    >
      <form id="add-user-form" noValidate onSubmit={submit} className="flex flex-col gap-4">
        {formError && (
          <Callout tone="danger" title="Couldn’t add this user">
            {formError}
          </Callout>
        )}
        <Field id="add-user-fullName" label="Full name" required error={errors.fullName}>
          <input
            {...fieldAria('add-user-fullName', { error: errors.fullName })}
            autoComplete="off"
            value={form.fullName}
            onChange={(e) => set('fullName', e.target.value)}
            className={inputClasses(Boolean(errors.fullName))}
          />
        </Field>
        <Field id="add-user-email" label="Work email" required error={errors.email} hint="They sign in with this.">
          <input
            {...fieldAria('add-user-email', { error: errors.email, hasHint: true })}
            type="email"
            inputMode="email"
            autoComplete="off"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            className={inputClasses(Boolean(errors.email))}
          />
        </Field>
        <Field id="add-user-title" label="Job title" error={errors.title}>
          <input
            {...fieldAria('add-user-title', { error: errors.title })}
            autoComplete="off"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="e.g. Video Editor"
            className={inputClasses(Boolean(errors.title))}
          />
        </Field>
        <RolePicker name="add-user-role" value={form.role} onChange={(role) => set('role', role)} />
        <Field
          id="add-user-password"
          label="Temporary password"
          required
          error={errors.password}
          hint={`${PASSWORD_MIN}–${PASSWORD_MAX} characters. They’ll replace it when they first sign in.`}
        >
          <div className="flex gap-2">
            <input
              {...fieldAria('add-user-password', { error: errors.password, hasHint: true })}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              className={`${inputClasses(Boolean(errors.password))} font-mono`}
            />
            <button
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((s) => !s)}
              className={buttonClasses('secondary', 'md', 'shrink-0 px-3')}
            >
              {showPassword ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
            </button>
          </div>
        </Field>
        <button
          type="button"
          className={buttonClasses('ghost', 'sm', 'self-start')}
          onClick={() => {
            set('password', generatePassword())
            setShowPassword(true)
          }}
        >
          <RefreshCw aria-hidden className="size-4" />
          Generate a password
        </button>
        <p className="flex items-start gap-1.5 text-xs text-muted-fg">
          <ShieldCheck aria-hidden className="mt-px size-3.5 shrink-0" />
          No email is sent. Recorded in the account history as added by you ({me.name}). Admin access can’t be granted here.
        </p>
      </form>
    </Dialog>
  )
}
