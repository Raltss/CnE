import { createContext, useContext } from 'react'
import type { Person } from '../data/types'

export interface AppSession {
  /** The signed-in staff member (or, in demo mode, the account being viewed). */
  me: Person
  /** Demo mode only: view the app as another demo account. Not authentication. */
  switchAccount: ((personId: string) => void) | null
  /** Real sign-in only: end the Supabase session. */
  signOut: (() => Promise<void>) | null
  /** Real sign-in only: check the current password, then set a new one. Resolves to an error message, or null. */
  changePassword: ((current: string, next: string) => Promise<string | null>) | null
}

export const SessionContext = createContext<AppSession | null>(null)

export function useSession(): AppSession {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside <AuthProvider> or <DemoSessionProvider>')
  return ctx
}
