import { Inbox, Truck, Clapperboard } from 'lucide-react'
import type { Lookup } from '../../data/selectors'
import type { Submission } from '../../data/types'
import { OUTCOME_META } from '../../lib/status'
import { cx } from '../../lib/styles'
import { formatDateTime } from '../../lib/time'
import { EmptyState } from '../ui/EmptyState'
import { LinkField } from './LinkField'

function sameLinksAs(sub: Submission, all: Submission[]) {
  const earlier = all.find(
    (o) => o.round < sub.round && o.reviewLink === sub.reviewLink && o.deliveryLink === sub.deliveryLink,
  )
  return earlier?.round ?? null
}

/** Who decided what and when: the internal review, then the client's decision if it went to them. */
function decisions(sub: Submission, lookup: Lookup): string[] {
  const by = (id: string | null) => lookup.personName(id ?? '')
  if (!sub.decidedAt) return []
  if (sub.outcome === 'feedback') return [`Feedback requested ${formatDateTime(sub.decidedAt)} by ${by(sub.decidedById)}`]
  if (!sub.sentToClientAt) return [`Approved ${formatDateTime(sub.decidedAt)} by ${by(sub.decidedById)}`]
  const sent = `Approved and sent to the client ${formatDateTime(sub.sentToClientAt)} by ${by(sub.decidedById)}`
  if (!sub.clientDecidedAt) return [sent]
  const verdict = sub.outcome === 'client_feedback' ? 'Client asked for changes' : 'Client approved'
  return [sent, `${verdict} ${formatDateTime(sub.clientDecidedAt)} (recorded by ${by(sub.clientDecidedById)})`]
}

/** Every round is listed separately, newest first, even when links are reused. */
/** `rounds` are newest first, as the package query returns them. */
export function SubmissionHistory({ rounds: subs, lookup }: { rounds: Submission[]; lookup: Lookup }) {
  if (!subs.length)
    return (
      <EmptyState icon={Inbox} title="No submissions yet" compact>
        Each round of review and delivery links will be listed here.
      </EmptyState>
    )

  return (
    <ol className="flex flex-col gap-3">
      {subs.map((sub) => {
        const outcome = OUTCOME_META[sub.outcome]
        const OutcomeIcon = outcome.icon
        const reused = sameLinksAs(sub, subs)
        return (
          <li key={sub.id} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Round {sub.round}</h3>
              <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', outcome.className)}>
                <OutcomeIcon aria-hidden className="size-3.5" />
                {outcome.label}
              </span>
            </div>
            <p className="text-xs text-muted-fg tabular-nums">
              Submitted {formatDateTime(sub.submittedAt)} by {lookup.personName(sub.submittedById)}
              {reused && ` · Same links as Round ${reused}`}
            </p>
            <div className="mt-1 grid gap-x-4 sm:grid-cols-2">
              <LinkField label="Review link" icon={Clapperboard} url={sub.reviewLink} />
              <LinkField label="Delivery link" icon={Truck} url={sub.deliveryLink} />
            </div>
            {decisions(sub, lookup).map((line) => (
              <p key={line} className="mt-1 text-xs text-muted-fg tabular-nums">
                {line}
              </p>
            ))}
            {sub.feedbackNote && (
              <blockquote className="mt-2 border-l-2 border-st-feedback pl-3 text-sm">
                <span className="sr-only">{sub.outcome === 'client_feedback' ? 'Client’s request: ' : 'Manager note: '}</span>
                {sub.feedbackNote}
              </blockquote>
            )}
          </li>
        )
      })}
    </ol>
  )
}
