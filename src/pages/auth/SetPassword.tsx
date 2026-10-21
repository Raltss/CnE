import { PasswordForm } from '../../components/domain/PasswordForm'
import { buttonClasses } from '../../lib/styles'
import { AuthLayout } from './AuthLayout'

/** First sign-in with a temporary password from an admin: choose your own before continuing. */
export function SetPassword({
  email,
  onSave,
  onSignOut,
}: {
  email: string
  onSave: (password: string) => Promise<string | null>
  onSignOut: () => void
}) {
  return (
    <AuthLayout
      title="Choose your password"
      description={`You signed in as ${email} with a temporary password from your admin. Choose your own to continue; your admin won’t know it.`}
    >
      <div className="flex flex-col gap-4">
        {/* Lets password managers save the new password under the right account. */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <PasswordForm askCurrent={false} idPrefix="first-password" submitLabel="Save and continue" onSubmit={(_current, next) => onSave(next)} />
        <button type="button" className={buttonClasses('ghost', 'sm', 'self-start')} onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </AuthLayout>
  )
}
