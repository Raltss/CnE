import { LogOut } from 'lucide-react'
import { PasswordForm } from '../components/domain/PasswordForm'
import { RoleBadge } from '../components/domain/StatusBadge'
import { PageHeader, Section } from '../components/ui/Section'
import { ThemePicker } from '../components/ui/ThemeToggle'
import { useToast } from '../components/ui/toast-context'
import { buttonClasses } from '../lib/styles'
import { initials } from '../lib/initials'
import { useSession } from '../session/context'

/** Everyone: who you're signed in as, how the app looks, changing your password, and signing out. */
export function Account() {
  const { me, email, changePassword, signOut } = useSession()
  const toast = useToast()

  return (
    <>
      <PageHeader title="Your account" description="Your sign-in details. Your role is managed by an admin." />
      <div className="grid gap-6 lg:grid-cols-5 lg:items-start">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Section title="Profile">
            <div className="flex items-center gap-4">
              <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-2 text-base font-medium">
                {initials(me.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold">{me.name}</p>
                {email && <p className="truncate text-ui text-muted-fg">{email}</p>}
              </div>
            </div>
            <dl className="mt-5 divide-y divide-border border-t border-border text-ui">
              {me.title && (
                <div className="flex items-center justify-between gap-4 py-3">
                  <dt className="text-muted-fg">Job title</dt>
                  <dd className="text-right">{me.title}</dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-muted-fg">Role</dt>
                <dd>
                  <RoleBadge role={me.role} />
                </dd>
              </div>
            </dl>
            <button type="button" className={buttonClasses('secondary', 'md', 'mt-2 w-full')} onClick={() => void signOut()}>
              <LogOut aria-hidden />
              Sign out
            </button>
          </Section>

          <Section title="Appearance">
            <ThemePicker />
          </Section>
        </div>

        <Section title="Change password" description="You’ll stay signed in on this device." className="lg:col-span-3">
          <PasswordForm
            askCurrent
            idPrefix="account-password"
            submitLabel="Change password"
            onSubmit={changePassword}
            onSuccess={() => toast.show('Password changed')}
          />
        </Section>
      </div>
    </>
  )
}
