import { Play } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../data/store'
import type { WorkPackage } from '../../data/types'
import { buttonClasses } from '../../lib/styles'
import { useToast } from '../ui/toast-context'

/** The editor's next step for a package: Start inline, or go to the package to submit. */
export function EditorPackageAction({ pkg, editorId }: { pkg: WorkPackage; editorId: string }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  if (pkg.status === 'assigned')
    return (
      <button
        type="button"
        className={buttonClasses('primary', 'sm')}
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          const r = await api.startWork(editorId, pkg.id)
          setBusy(false)
          toast.show(r.ok ? `Started work on ${pkg.title}` : r.error, r.ok ? 'success' : 'error')
        }}
      >
        <Play aria-hidden className="size-3.5" />
        Start
      </button>
    )
  if (pkg.status === 'in_progress' || pkg.status === 'apply_feedback')
    return (
      <Link to={`/packages/${pkg.id}`} className={buttonClasses('primary', 'sm')}>
        {pkg.status === 'apply_feedback' ? 'Resubmit' : 'Submit'}
      </Link>
    )
  return (
    <Link to={`/packages/${pkg.id}`} className={buttonClasses('secondary', 'sm')}>
      Open
    </Link>
  )
}
