import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useAppState } from '../data/hooks'
import { SessionContext } from './context'

const ACCOUNT_KEY = 'cne.demo.account'
const DEFAULT_ACCOUNT = 'mgr_andrea'

function readAccount() {
  try {
    return localStorage.getItem(ACCOUNT_KEY) ?? DEFAULT_ACCOUNT
  } catch {
    return DEFAULT_ACCOUNT
  }
}

/** Demo mode (VITE_USE_DEMO_DATA=true): pick any sample account, no sign-in. */
export function DemoSessionProvider({ children }: { children: ReactNode }) {
  const state = useAppState()
  const [accountId, setAccountId] = useState(readAccount)

  const switchAccount = useCallback((personId: string) => {
    setAccountId(personId)
    try {
      localStorage.setItem(ACCOUNT_KEY, personId)
    } catch {
      // Remembering the account is a convenience; ignore storage failures.
    }
  }, [])

  // A remembered account that was deactivated (or no longer exists) falls back to the default.
  const me = state.people.find((p) => p.id === accountId && p.isActive) ?? state.people.find((p) => p.id === DEFAULT_ACCOUNT)!
  const value = useMemo(() => ({ me, switchAccount, signOut: null, changePassword: null }), [me, switchAccount])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
