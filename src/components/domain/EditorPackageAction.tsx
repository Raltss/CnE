import { Play } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../data/api'
import type { PackageSummary } from '../../data/types'
import { buttonClasses, cx, type ButtonSize } from '../../lib/styles'
import { useToast } from '../ui/toast-context'

/**
 * The editor's next step for a package: Start inline, or go to the package to submit.
 * `emphasis` makes it the screen's primary action; in lists it stays secondary.
 */
export function EditorPackageAction({ pkg, size = 'sm', emphasis }: { pkg: PackageSummary; size?: ButtonSize; emphasis?: boolean }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const step = emphasis ? 'primary' : 'secondary'
  // In lists every action takes one width, so their edges line up.
  const width = emphasis ? undefined : 'min-w-24'
  if (pkg.status === 'assigned')
    return (
      <button
        type="button"
        className={buttonClasses(step, size, width)}
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          const r = await api.startWork(pkg.id)
          setBusy(false)
          toast.show(r.ok ? `Started work on ${pkg.title}` : r.error, r.ok ? 'success' : 'error')
        }}
      >
        <Play aria-hidden />
        Start
      </button>
    )
  if (pkg.status === 'in_progress' || pkg.status === 'apply_feedback')
    return (
      <Link to={`/packages/${pkg.id}`} className={buttonClasses(step, size, width)}>
        {pkg.status === 'apply_feedback' ? 'Resubmit' : 'Submit'}
      </Link>
    )
  // The round can't be completed without the final file.
  if ((pkg.status === 'submitted' || pkg.status === 'client_review') && pkg.latest && !pkg.latest.deliveryLink)
    return (
      <Link to={`/packages/${pkg.id}`} className={buttonClasses(step, size, width)}>
        Add delivery link
      </Link>
    )
  return (
    <Link to={`/packages/${pkg.id}`} className={buttonClasses('ghost', size, cx('text-muted-fg', width))}>
      Open
    </Link>
  )
}
