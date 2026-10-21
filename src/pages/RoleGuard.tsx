import { ShieldAlert } from 'lucide-react'
import { Link, Navigate, Outlet } from 'react-router'
import { EmptyState } from '../components/ui/EmptyState'
import type { Role } from '../data/types'
import { HOME } from '../layout/nav'
import { buttonClasses } from '../lib/styles'
import { useSession } from '../session/context'

/**
 * Keeps people on pages meant for their role. This is a convenience only: the
 * database (RLS and the workflow functions) is what actually enforces access.
 */
export function RoleGuard({ roles }: { roles: Role[] }) {
  const { me, switchAccount } = useSession()
  if (roles.includes(me.role)) return <Outlet />
  return (
    <EmptyState
      icon={ShieldAlert}
      title={`This page is for ${roles.map((r) => `${r}s`).join(' and ')}`}
      tone="error"
      action={
        <Link to={HOME[me.role]} className={buttonClasses('primary')}>
          Go to my home page
        </Link>
      }
    >
      You’re signed in as {me.name} ({me.role}).{switchAccount && ' Switch accounts in the demo bar to see this page.'}
    </EmptyState>
  )
}

/** "/" sends each role to its own home page. */
export function RoleHome() {
  const { me } = useSession()
  return <Navigate to={HOME[me.role]} replace />
}
