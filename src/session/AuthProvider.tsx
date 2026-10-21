// Real sign-in with Supabase Auth (email + password).
//
//  restoring ─▶ signed out ─▶ <Login>
//      │
//      └──────▶ signed in ─▶ load profile ─▶ not approved / deactivated ─▶ "Waiting for access"
//                                       └─▶ active staff ─▶ load data ─▶ the app
//
// supabase-js keeps the session in localStorage and refreshes the token, so a
// page reload restores the session without signing in again.
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Person } from '../data/types'
import { AuthLayout, StatusScreen } from '../pages/auth/AuthLayout'
import { Login } from '../pages/auth/Login'
import { buttonClasses } from '../lib/styles'
import { SessionContext } from './context'
import { DataGate } from './DataGate'

type AuthState = { phase: 'restoring' } | { phase: 'signed_out' } | { phase: 'signed_in'; userId: string; email: string }

function fromSession(session: Session | null): AuthState {
  return session ? { phase: 'signed_in', userId: session.user.id, email: session.user.email ?? '' } : { phase: 'signed_out' }
}

export function AuthProvider({ supabase, children }: { supabase: SupabaseClient; children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ phase: 'restoring' })

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
  | { phase: 'ready'; me: Person }

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
      .select('id, full_name, title, role, is_active')
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
          })
      })
    return () => {
      cancelled = true
    }
  }, [supabase, userId, attempt])

  const me = profile.phase === 'ready' ? profile.me : null
  const session = useMemo(() => (me ? { me, switchAccount: null, signOut } : null), [me, signOut])

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

  return (
    <SessionContext.Provider value={session}>
      <DataGate onSignOut={() => void signOut()}>{children}</DataGate>
    </SessionContext.Provider>
  )
}
