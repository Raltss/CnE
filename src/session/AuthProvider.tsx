// Real sign-in with Supabase Auth (email + password).
//
//  restoring ─▶ signed out ─▶ <Login>
//      │
//      └──────▶ signed in ─▶ load profile ─▶ not approved / deactivated ─▶ "Waiting for access"
//                                       ├─▶ temporary password from an admin ─▶ "Choose your password"
//                                       └─▶ active staff ─▶ the app (each page loads its own data)
//
// supabase-js keeps the session in localStorage and refreshes the token, so a
// page reload restores the session without signing in again.
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Person } from '../data/types'
import { AuthLayout, StatusScreen } from '../pages/auth/AuthLayout'
import { Login } from '../pages/auth/Login'
import { SetPassword } from '../pages/auth/SetPassword'
import { buttonClasses } from '../lib/styles'
import { SessionContext } from './context'

type AuthState = { phase: 'restoring' } | { phase: 'signed_out' } | { phase: 'signed_in'; userId: string; email: string }

function fromSession(session: Session | null): AuthState {
  return session ? { phase: 'signed_in', userId: session.user.id, email: session.user.email ?? '' } : { phase: 'signed_out' }
}

export function AuthProvider({
  supabase,
  onSignedIn,
  children,
}: {
  supabase: SupabaseClient
  /** Called once a session exists, e.g. to start the first data reads while the profile loads. */
  onSignedIn?: () => void
  children: ReactNode
}) {
  const [auth, setAuth] = useState<AuthState>({ phase: 'restoring' })
  const signedIn = auth.phase === 'signed_in'
  const userId = signedIn ? auth.userId : null
  const lastUserId = useRef<string | null>(null)

  useEffect(() => {
    if (signedIn) onSignedIn?.()
  }, [signedIn, onSignedIn])

  useEffect(() => {
    if (!userId) return
    // Someone else signed in on this browser: start them on their own home page, not on
    // the page (and filters) the previous person left open. A reload keeps the URL.
    if (lastUserId.current && lastUserId.current !== userId) window.history.replaceState(null, '', '/')
    lastUserId.current = userId
  }, [userId])

  useEffect(() => {
    // Keep the same object while the user is unchanged, so token refreshes don't reload the profile.
    const apply = (session: Session | null) =>
      setAuth((prev) => {
        const next = fromSession(session)
        return prev.phase === 'signed_in' && next.phase === 'signed_in' && prev.userId === next.userId ? prev : next
      })
    void supabase.auth.getSession().then(({ data }) => apply(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => apply(session))
    return () => data.subscription.unsubscribe()
  }, [supabase])

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return error ? error.message : null
    },
    [supabase],
  )
  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [supabase])

  if (auth.phase === 'restoring') return <StatusScreen title="Signing you in" message="Restoring your session…" />
  if (auth.phase === 'signed_out') return <Login signIn={signIn} />
  return (
    <StaffGate key={auth.userId} supabase={supabase} userId={auth.userId} email={auth.email} signOut={signOut}>
      {children}
    </StaffGate>
  )
}

type ProfileState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'no_access'; reason: 'pending' | 'deactivated' }
  | { phase: 'ready'; me: Person; mustChangePassword: boolean }

/** Only approved, active staff get past this point. RLS enforces the same rule on every query. */
function StaffGate({
  supabase,
  userId,
  email,
  signOut,
  children,
}: {
  supabase: SupabaseClient
  userId: string
  email: string
  signOut: () => Promise<void>
  children: ReactNode
}) {
  const [profile, setProfile] = useState<ProfileState>({ phase: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void supabase
      .from('profiles')
      .select('id, full_name, title, role, is_active, must_change_password')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setProfile({ phase: 'error', message: error.message })
        else if (!data?.role) setProfile({ phase: 'no_access', reason: 'pending' })
        else if (!data.is_active) setProfile({ phase: 'no_access', reason: 'deactivated' })
        else
          setProfile({
            phase: 'ready',
            me: { id: data.id, name: data.full_name, title: data.title, role: data.role, isActive: true },
            mustChangePassword: data.must_change_password,
          })
      })
    return () => {
      cancelled = true
    }
  }, [supabase, userId, attempt])

  // An admin may deactivate someone or change their role while they're signed in. RLS
  // blocks their reads at once; re-checking when they return to the tab (and every few
  // minutes) also moves them to the right screen, with a fresh cache, without a reload.
  const role = profile.phase === 'ready' ? profile.me.role : null
  useEffect(() => {
    if (!role) return
    const recheck = async () => {
      if (document.visibilityState !== 'visible') return
      const { data, error } = await supabase.from('profiles').select('role, is_active').eq('id', userId).maybeSingle()
      if (error) return // e.g. offline; nothing changed that we know of
      if (data?.role !== role || !data.is_active) {
        setProfile({ phase: 'loading' })
        setAttempt((n) => n + 1)
      }
    }
    document.addEventListener('visibilitychange', recheck)
    const timer = window.setInterval(recheck, 5 * 60_000)
    return () => {
      document.removeEventListener('visibilitychange', recheck)
      window.clearInterval(timer)
    }
  }, [supabase, userId, role])

  /** Sets the new password in Supabase Auth, then clears the "choose your password" prompt. */
  const savePassword = useCallback(
    async (next: string) => {
      const { error } = await supabase.auth.updateUser({ password: next })
      if (error) return passwordMessage(error.message)
      const { error: recordError } = await supabase.rpc('complete_password_change')
      return recordError ? `Your password was changed, but it couldn’t be recorded: ${recordError.message}` : null
    },
    [supabase],
  )
  const changePassword = useCallback(
    async (current: string, next: string) => {
      // Confirm it's really them (same account) before changing the password.
      const { error } = await supabase.auth.signInWithPassword({ email, password: current })
      if (error) return /invalid login credentials/i.test(error.message) ? 'Your current password is incorrect.' : error.message
      return savePassword(next)
    },
    [supabase, email, savePassword],
  )

  const me = profile.phase === 'ready' ? profile.me : null
  const session = useMemo(() => (me ? { me, email, signOut, changePassword } : null), [me, email, signOut, changePassword])

  if (profile.phase === 'loading') return <StatusScreen title="Signing you in" message="Checking your account…" />
  if (profile.phase === 'error')
    return (
      <StatusScreen
        title="Couldn’t load your account"
        message={profile.message}
        error
        onRetry={() => {
          setProfile({ phase: 'loading' })
          setAttempt((n) => n + 1)
        }}
        onSignOut={() => void signOut()}
      />
    )
  if (profile.phase === 'no_access')
    return (
      <AuthLayout
        title={profile.reason === 'pending' ? 'Waiting for access' : 'Account deactivated'}
        description={
          profile.reason === 'pending'
            ? `You’re signed in as ${email}, but an admin hasn’t approved this account or given it a role yet.`
            : `The account ${email} has been deactivated. Contact your admin if you think this is a mistake.`
        }
      >
        <button type="button" className={buttonClasses('secondary', 'md', 'w-full')} onClick={() => void signOut()}>
          Sign out
        </button>
      </AuthLayout>
    )

  if (profile.mustChangePassword)
    return (
      <SetPassword
        email={email}
        onSignOut={() => void signOut()}
        onSave={async (next) => {
          const error = await savePassword(next)
          if (!error) setProfile({ ...profile, mustChangePassword: false })
          return error
        }}
      />
    )

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

/** Supabase Auth's password errors, in plain words. */
function passwordMessage(message: string) {
  if (/different from the old password|same_password/i.test(message)) return 'Choose a password that’s different from your current one.'
  if (/reauthenticat/i.test(message)) return 'For security, sign out, sign back in, and try again.'
  return message
}
