import { LogIn } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Callout } from '../../components/ui/Callout'
import { Field } from '../../components/ui/Field'
import { buttonClasses, fieldAria, inputClasses } from '../../lib/styles'
import { AuthLayout } from './AuthLayout'

function signInMessage(message: string) {
  if (/invalid login credentials/i.test(message)) return 'The email or password is incorrect.'
  if (/email not confirmed/i.test(message)) return 'This email address hasn’t been confirmed. Ask your admin to confirm it.'
  if (/failed to fetch|network/i.test(message)) return 'Couldn’t reach the server. Check your connection and try again.'
  if (/rate limit|too many/i.test(message)) return 'Too many sign-in attempts. Wait a few minutes and try again.'
  return message
}

/** Email + password sign-in. There's no sign-up: accounts are created by an admin. */
export function Login({ signIn }: { signIn: (email: string, password: string) => Promise<string | null> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const next: typeof errors = {}
    if (!email.trim()) next.email = 'Enter your work email.'
    if (!password) next.password = 'Enter your password.'
    setErrors(next)
    if (next.email || next.password) {
      document.getElementById(next.email ? 'login-email' : 'login-password')?.focus()
      return
    }
    setBusy(true)
    const error = await signIn(email.trim(), password)
    // On success the auth listener swaps this screen for the app.
    if (error) {
      setBusy(false)
      setErrors({ form: signInMessage(error) })
    }
  }

  return (
    <AuthLayout title="Sign in" description="Use the work email and password your admin set up for you.">
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        {errors.form && (
          <Callout tone="danger" title="Couldn’t sign in">
            {errors.form}
          </Callout>
        )}
        <Field id="login-email" label="Email" required error={errors.email}>
          <input
            {...fieldAria('login-email', { error: errors.email })}
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClasses(Boolean(errors.email))}
          />
        </Field>
        <Field id="login-password" label="Password" required error={errors.password}>
          <input
            {...fieldAria('login-password', { error: errors.password })}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClasses(Boolean(errors.password))}
          />
        </Field>
        <button type="submit" disabled={busy} className={buttonClasses('primary', 'md', 'mt-1 min-h-11 w-full')}>
          <LogIn aria-hidden />
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-sm text-muted-fg">No account, or forgot your password? Ask your admin: accounts are created by the agency, so there’s no sign-up.</p>
      </form>
    </AuthLayout>
  )
}
