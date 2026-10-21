import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { PASSWORD_MAX, PASSWORD_MIN, validateNewPassword } from '../../data/validation'
import { buttonClasses, fieldAria, inputClasses } from '../../lib/styles'
import { Callout } from '../ui/Callout'
import { Field } from '../ui/Field'

interface PasswordFormProps {
  /** Ask for the current password first (changing it later), or not (just signed in with a temporary one). */
  askCurrent: boolean
  submitLabel: string
  /** Returns an error message, or null when the password was changed. */
  onSubmit: (current: string, next: string) => Promise<string | null>
  onSuccess?: () => void
  /** Prefix for field ids, so two forms never clash. */
  idPrefix: string
}

/** New password + confirm (and optionally the current one), with show/hide and inline errors. */
export function PasswordForm({ askCurrent, submitLabel, onSubmit, onSuccess, idPrefix }: PasswordFormProps) {
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState<{ current?: string; password?: string; confirm?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)
  const id = (field: string) => `${idPrefix}-${field}`

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const next: typeof errors = { ...validateNewPassword(password, confirm) }
    if (askCurrent && !current) next.current = 'Enter your current password.'
    setErrors(next)
    const firstInvalid = (['current', 'password', 'confirm'] as const).find((f) => next[f])
    if (firstInvalid) {
      document.getElementById(id(firstInvalid))?.focus()
      return
    }
    setBusy(true)
    const error = await onSubmit(current, password)
    setBusy(false)
    if (error) {
      setErrors({ form: error })
      return
    }
    setCurrent('')
    setPassword('')
    setConfirm('')
    onSuccess?.()
  }

  const type = show ? 'text' : 'password'
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {errors.form && (
        <Callout tone="danger" title="Password not changed">
          {errors.form}
        </Callout>
      )}
      {askCurrent && (
        <Field id={id('current')} label="Current password" required error={errors.current}>
          <input
            {...fieldAria(id('current'), { error: errors.current })}
            type={type}
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={inputClasses(Boolean(errors.current))}
          />
        </Field>
      )}
      <Field
        id={id('password')}
        label="New password"
        required
        error={errors.password}
        hint={`${PASSWORD_MIN}–${PASSWORD_MAX} characters. A short phrase is easier to remember than a jumble.`}
      >
        <input
          {...fieldAria(id('password'), { error: errors.password, hasHint: true })}
          type={type}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClasses(Boolean(errors.password))}
        />
      </Field>
      <Field id={id('confirm')} label="Confirm new password" required error={errors.confirm}>
        <input
          {...fieldAria(id('confirm'), { error: errors.confirm })}
          type={type}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputClasses(Boolean(errors.confirm))}
        />
      </Field>
      <button type="button" aria-pressed={show} className={buttonClasses('ghost', 'sm', 'self-start')} onClick={() => setShow((s) => !s)}>
        {show ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
        {show ? 'Hide passwords' : 'Show passwords'}
      </button>
      <button type="submit" disabled={busy} className={buttonClasses('primary', 'md', 'w-full sm:w-auto sm:self-start')}>
        <KeyRound aria-hidden className="size-4" />
        {busy ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}
