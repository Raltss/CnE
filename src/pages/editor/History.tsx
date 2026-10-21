import { History as HistoryIcon } from 'lucide-react'
import { PackageTable } from '../../components/domain/PackageTable'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader, Section } from '../../components/ui/Section'
import { useAppState, useNow } from '../../data/hooks'
import { useSession } from '../../session/context'
import { myHistory } from './editorData'

export function History() {
  const state = useAppState()
  const now = useNow()
  const { me } = useSession()
  const items = myHistory(state, me.id)
  return (
    <>
      <PageHeader title="History" description="Your completed work, most recent first. Open a package to see every submission round." />
      <Section title={`${items.length} completed ${items.length === 1 ? 'package' : 'packages'}`} flush>
        {items.length ? (
          <PackageTable
            state={state}
            packages={items}
            now={now}
            caption="Completed packages"
            columns={['package', 'clientProduct', 'status', 'round', 'submitted', 'deadline']}
          />
        ) : (
          <EmptyState icon={HistoryIcon} title="No completed work yet">
            Approved packages stay here for tracking.
          </EmptyState>
        )}
      </Section>
    </>
  )
}
