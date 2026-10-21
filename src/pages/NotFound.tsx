import { SearchX } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState } from '../components/ui/EmptyState'
import { HOME } from '../layout/nav'
import { buttonClasses } from '../lib/styles'
import { useSession } from '../session/context'

export function NotFound() {
  const { me } = useSession()
  return (
    <EmptyState
      icon={SearchX}
      title="Page not found"
      action={
        <Link to={HOME[me.role]} className={buttonClasses('primary')}>
          Go to my home page
        </Link>
      }
    >
      The link may be outdated, or this page isn’t part of the prototype.
    </EmptyState>
  )
}
