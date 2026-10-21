import { PasswordForm } from '../components/domain/PasswordForm'
import { RoleBadge } from '../components/domain/StatusBadge'
import { Callout } from '../components/ui/Callout'
import { PageHeader, Section } from '../components/ui/Section'
import { useToast } from '../components/ui/toast-context'
import { useAppState } from '../data/hooks'
import { useSession } from '../session/context'

/** Everyone: who you're signed in as, and changing your password. */
export function Account() {
  const { me, changePassword } = useSession()
  const { accounts } = useAppState()
  const toast = useToast()
  const email = accounts.find((a) => a.id === me.id)?.email

  return (
    <>
      <PageHeader title="Your account" description="Your sign-in details. Your role is managed by an admin." />
      <div className="grid gap-5 lg:grid-cols-5 lg:items-start">
        <Section title="Profile" className="lg:col-span-2">
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="text-xs font-semibold text-muted-fg">Name</dt>
              <dd className="font-semibold">{me.name}</dd>
            </div>
            {email && (
              <div>
                <dt className="text-xs font-semibold text-muted-fg">Email</dt>
                <dd className="break-all">{email}</dd>
              </div>
            )}
            {me.title && (
              <div>
                <dt className="text-xs font-semibold text-muted-fg">Job title</dt>
                <dd>{me.title}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-semibold text-muted-fg">Role</dt>
              <dd className="mt-0.5">
                <RoleBadge role={me.role} />
              </dd>
            </div>
          </dl>
        </Section>

        <Section title="Change password" description="You’ll stay signed in on this device." className="lg:col-span-3">
          {changePassword ? (
            <PasswordForm
              askCurrent
              idPrefix="account-password"
              submitLabel="Change password"
              onSubmit={changePassword}
              onSuccess={() => toast.show('Password changed')}
            />
          ) : (
            <Callout tone="info" title="No passwords in the demo">
              The demo has no sign-in, so there’s no password to change. With Supabase, this is where you change yours.
            </Callout>
          )}
        </Section>
      </div>
    </>
  )
}
