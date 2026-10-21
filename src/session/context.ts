import { createContext, useContext } from 'react'
import type { Person } from '../data/types'

export interface AppSession {
  /** The signed-in staff member. */
  me: Person
  /** Their sign-in email. */
  email: string
  signOut: () => Promise<void>
  /** Check the current password, then set a new one. Resolves to an error message, or null. */
  changePassword: (current: string, next: string) => Promise<string | null>
}

export const SessionContext = createContext<AppSession | null>(null)

export function useSession(): AppSession {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside <AuthProvider>')
  return ctx
}
