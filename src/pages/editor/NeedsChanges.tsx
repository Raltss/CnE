import { CircleCheck } from 'lucide-react'
import { FeedbackCard } from '../../components/domain/FeedbackCard'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageStatus } from '../../components/ui/PageStatus'
import { PageHeader } from '../../components/ui/Section'
import { useNow } from '../../data/hooks'
import { pageStatus, useActiveWork, useDirectory } from '../../data/queries'
import { cardClasses } from '../../lib/styles'
import { useSession } from '../../session/context'

export function NeedsChanges() {
  const now = useNow()
  const { me } = useSession()
  const work = useActiveWork()
  const { lookup, queries } = useDirectory()
  const status = pageStatus(work, ...queries)
  if (status.pending || status.error) return <PageStatus {...status} />
  const items = work.data!.filter((p) => p.editorId === me.id && p.status === 'apply_feedback')
  return (
    <>
      <PageHeader
        title="Needs changes"
        description="Packages marked Apply Feedback. Read the comments in Frame.io, then resubmit new links. Each resubmission is saved as a new round."
      />
      {items.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((pkg) => (
            <FeedbackCard key={pkg.id} lookup={lookup} pkg={pkg} now={now} />
          ))}
        </div>
      ) : (
        <div className={cardClasses}>
          <EmptyState icon={CircleCheck} title="No changes requested">
            When a manager marks Apply Feedback on your submission, it shows up here.
          </EmptyState>
        </div>
      )}
    </>
  )
}
