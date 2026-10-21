import { CircleCheck } from 'lucide-react'
import { FeedbackCard } from '../../components/domain/FeedbackCard'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/Section'
import { useAppState, useNow } from '../../data/hooks'
import { cardClasses } from '../../lib/styles'
import { useSession } from '../../session/context'
import { myNeedsChanges } from './editorData'

export function NeedsChanges() {
  const state = useAppState()
  const now = useNow()
  const { me } = useSession()
  const items = myNeedsChanges(state, me.id)
  return (
    <>
      <PageHeader
        title="Needs changes"
        description="Packages marked Apply Feedback. Read the comments in Frame.io, then resubmit new links. Each resubmission is saved as a new round."
      />
      {items.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((pkg) => (
            <FeedbackCard key={pkg.id} state={state} pkg={pkg} now={now} />
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
