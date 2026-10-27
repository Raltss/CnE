import { RotateCcw } from 'lucide-react'
import { Link } from 'react-router'
import type { Lookup } from '../../data/selectors'
import type { PackageSummary } from '../../data/types'
import { buttonClasses, cardClasses, cx } from '../../lib/styles'
import { DeadlineBadge } from './DeadlineBadge'
import { StatusBadge } from './StatusBadge'

/** Who asked for the changes on the latest round, and what they said. */
export function FeedbackNote({ lookup, pkg }: { lookup: Lookup; pkg: PackageSummary }) {
  const sub = pkg.latest
  const who =
    sub?.outcome === 'client_feedback' ? 'The client' : sub?.outcome === 'approved' ? null : sub?.decidedById ? lookup.personName(sub.decidedById) : null
  const text =
    sub?.outcome === 'approved'
      ? // A manager reopened it after approval; the note is in the package's history.
        'Reopened for changes after approval. Open the package to see the note.'
      : sub?.feedbackNote
        ? `“${sub.feedbackNote}”`
        : 'Changes requested. See the comments in Frame.io.'
  return (
    <figure className="rounded-lg bg-surface-2 px-4 py-3">
      <blockquote className="text-ui text-fg">{text}</blockquote>
      {who && (
        <figcaption className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-fg">
          <RotateCcw aria-hidden className="size-3.5 text-st-feedback" />
          {who} · Round <span className="font-mono">{sub?.round}</span>
        </figcaption>
      )}
    </figure>
  )
}

/** A package that needs feedback changes: the note first, then the deadline and the way back in. */
export function FeedbackCard({ lookup, pkg, now }: { lookup: Lookup; pkg: PackageSummary; now: Date }) {
  return (
    <article className={cx(cardClasses, 'flex flex-col gap-4 p-5')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">
            <Link to={`/packages/${pkg.id}`} className="decoration-border-strong underline-offset-4 hover:underline">
              {pkg.title}
            </Link>
          </h3>
          <p className="mt-0.5 text-sm text-muted-fg">
            {lookup.productName(pkg.productId)} · <span className="font-mono">{pkg.code}</span>
          </p>
        </div>
        <StatusBadge status={pkg.status} />
      </div>
      <FeedbackNote lookup={lookup} pkg={pkg} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <DeadlineBadge pkg={pkg} now={now} />
        <Link to={`/packages/${pkg.id}`} className={buttonClasses('primary', 'sm')}>
          Open and resubmit
        </Link>
      </div>
    </article>
  )
}
