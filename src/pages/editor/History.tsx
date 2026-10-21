import { History as HistoryIcon } from 'lucide-react'
import { PackageTable } from '../../components/domain/PackageTable'
import { EmptyState } from '../../components/ui/EmptyState'
import { LoadMore, PageStatus } from '../../components/ui/PageStatus'
import { PageHeader, Section } from '../../components/ui/Section'
import { useNow } from '../../data/hooks'
import { pageStatus, pagedRows, pagedTotal, useDirectory, useFinishedPackages } from '../../data/queries'
import { useSession } from '../../session/context'

export function History() {
  const now = useNow()
  const { me } = useSession()
  const finished = useFinishedPackages({ editor: me.id })
  const { lookup, queries } = useDirectory()
  const status = pageStatus(finished, ...queries)
  if (status.pending || status.error) return <PageStatus {...status} />

  const items = pagedRows(finished.data)
  const total = pagedTotal(finished.data)
  return (
    <>
      <PageHeader title="History" description="Your completed work, most recent first. Open a package to see every submission round." />
      <Section title={`${total} completed ${total === 1 ? 'package' : 'packages'}`} flush>
        {items.length ? (
          <>
            <PackageTable
              lookup={lookup}
              packages={items}
              now={now}
              caption="Completed packages"
              columns={['package', 'product', 'status', 'round', 'submitted', 'deadline']}
            />
            <LoadMore
              shown={items.length}
              total={total}
              loading={finished.isFetchingNextPage}
              onMore={() => void finished.fetchNextPage()}
              noun="packages"
            />
          </>
        ) : (
          <EmptyState icon={HistoryIcon} title="No completed work yet">
            Approved packages stay here for tracking.
          </EmptyState>
        )}
      </Section>
    </>
  )
}
