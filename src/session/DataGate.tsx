import { useEffect, type ReactNode } from 'react'
import { useStoreStatus } from '../data/hooks'
import { appStore } from '../data/store'
import { StatusScreen } from '../pages/auth/AuthLayout'

/**
 * Loads the signed-in person's data and keeps it live while mounted. Pages
 * below it can call useAppState() and always get loaded data.
 */
export function DataGate({ children, onSignOut }: { children: ReactNode; onSignOut?: () => void }) {
  const status = useStoreStatus()

  useEffect(() => {
    appStore.start()
    return () => appStore.stop()
  }, [])

  if (status.phase === 'error')
    return (
      <StatusScreen
        title="Couldn’t load your work"
        message={status.error}
        error
        onRetry={() => void appStore.reload()}
        onSignOut={onSignOut}
      />
    )
  if (status.phase !== 'ready') return <StatusScreen title="Loading" message="Loading packages, attendance, and notifications…" />
  return children
}
