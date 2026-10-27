import { ExternalLink, Inbox } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { Lookup } from '../../data/selectors'
import type { RoundWithPackage, Submission } from '../../data/types'
import { formatDateTime } from '../../lib/time'
import { EmptyState } from '../ui/EmptyState'
import { OutcomeBadge } from './StatusBadge'
import { useIsWide } from '../../data/hooks'

interface SubmissionTableProps {
  lookup: Lookup
  submissions: RoundWithPackage[]
  caption: string
  /** Show who submitted the round (a manager's decisions) or who decided it (an editor's rounds). */
  person: 'submitter' | 'decider'
  emptyText?: string
}

function RoundLinks({ sub }: { sub: Submission }) {
  const links = [
    { label: 'Review', url: sub.reviewLink },
    { label: 'Delivery', url: sub.deliveryLink },
  ].filter((l): l is { label: string; url: string } => Boolean(l.url))
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {links.map((l) => (
        <a
          key={l.label}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-6 items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
        >
          {l.label}
          <ExternalLink aria-hidden className="size-3.5" />
          <span className="sr-only">link (opens in a new tab)</span>
        </a>
      ))}
    </span>
  )
}

/** Submission rounds across packages: dense table on ≥768px, stacked cards on mobile. */
export function SubmissionTable({ lookup, submissions, caption, person, emptyText }: SubmissionTableProps) {
  const wide = useIsWide()
  if (!submissions.length)
    return (
      <EmptyState icon={Inbox} title="No submission rounds" compact>
        {emptyText}
      </EmptyState>
    )

  const packageCell = (sub: RoundWithPackage): ReactNode => {
    const pkg = sub.package
    return pkg ? (
      <span className="flex flex-col">
        <Link to={`/packages/${pkg.id}`} className="font-medium text-fg decoration-border-strong underline-offset-4 hover:underline">
          {pkg.title}
        </Link>
        <span className="text-xs text-muted-fg tabular-nums">
          {pkg.code} · Round {sub.round}
        </span>
      </span>
    ) : (
      <span className="text-muted-fg">Round {sub.round} (package no longer visible)</span>
    )
  }
  const decision = (sub: Submission) =>
    sub.decidedAt ? `${formatDateTime(sub.decidedAt)}${person === 'decider' ? ` by ${lookup.personName(sub.decidedById ?? '')}` : ''}` : '—'
  const personHead = person === 'submitter' ? 'Editor' : 'Decided by'
  const personCell = (sub: Submission) =>
    person === 'submitter' ? lookup.personName(sub.submittedById) : sub.decidedById ? lookup.personName(sub.decidedById) : '—'

  return (
    <>
      {wide ? (
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-surface-2 text-xs font-semibold text-muted-fg">
            <tr>
              <th scope="col" className="px-4 py-2">Package</th>
              <th scope="col" className="px-4 py-2">Submitted</th>
              <th scope="col" className="px-4 py-2">Outcome</th>
              <th scope="col" className="px-4 py-2">{personHead}</th>
              <th scope="col" className="px-4 py-2">Decided</th>
              <th scope="col" className="px-4 py-2">Links</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((sub) => (
              <tr key={sub.id} className="border-t border-border align-top transition-colors duration-120 hover:bg-surface-2/60">
                <td className="min-w-48 px-4 py-3">{packageCell(sub)}</td>
                <td className="px-4 py-3 tabular-nums">{formatDateTime(sub.submittedAt)}</td>
                <td className="px-4 py-3">
                  <OutcomeBadge outcome={sub.outcome} />
                  {sub.feedbackNote && <p className="mt-1 max-w-64 text-xs text-muted-fg">“{sub.feedbackNote}”</p>}
                </td>
                <td className="px-4 py-3">{personCell(sub)}</td>
                <td className="px-4 py-3 tabular-nums">{sub.decidedAt ? formatDateTime(sub.decidedAt) : '—'}</td>
                <td className="px-4 py-3">
                  <RoundLinks sub={sub} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="divide-y divide-border" aria-label={caption}>
          {submissions.map((sub) => (
            <li key={sub.id} className="flex flex-col gap-2 px-4 py-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                {packageCell(sub)}
                <OutcomeBadge outcome={sub.outcome} />
              </div>
              <p className="text-xs text-muted-fg tabular-nums">
                Submitted {formatDateTime(sub.submittedAt)}
                {person === 'submitter' && ` by ${lookup.personName(sub.submittedById)}`}
                {sub.decidedAt && ` · Decided ${decision(sub)}`}
              </p>
              {sub.feedbackNote && <p className="text-xs text-muted-fg">“{sub.feedbackNote}”</p>}
              <RoundLinks sub={sub} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
