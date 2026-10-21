import { RotateCcw } from 'lucide-react'
import { Link } from 'react-router'
import type { Lookup } from '../../data/selectors'
import type { PackageSummary } from '../../data/types'
import { buttonClasses } from '../../lib/styles'
import { DeadlineBadge } from './DeadlineBadge'
import { StatusBadge } from './StatusBadge'

/** Highlighted card for packages that need feedback changes. */
export function FeedbackCard({ lookup, pkg, now }: { lookup: Lookup; pkg: PackageSummary; now: Date }) {
  const sub = pkg.latest
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-st-feedback/40 border-l-4 border-l-st-feedback bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold">
            <Link to={`/packages/${pkg.id}`} className="hover:text-primary hover:underline">
              {pkg.title}
            </Link>
          </h3>
          <p className="text-xs text-muted-fg">
            {lookup.productName(pkg.productId)} · Round {sub?.round ?? '?'}
          </p>
        </div>
        <StatusBadge status={pkg.status} />
      </div>
      <p className="flex gap-2 text-sm">
        <RotateCcw aria-hidden className="mt-0.5 size-4 shrink-0 text-st-feedback" />
        <span>
          {sub?.feedbackNote ? (
            <>
              <span className="font-semibold">{lookup.personName(sub.decidedById ?? '')}:</span> “{sub.feedbackNote}”
            </>
          ) : (
            'Changes requested. See the comments in Frame.io.'
          )}
        </span>
      </p>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <DeadlineBadge pkg={pkg} now={now} />
        <Link to={`/packages/${pkg.id}`} className={buttonClasses('primary', 'sm')}>
          Open and resubmit
        </Link>
      </div>
    </article>
  )
}
