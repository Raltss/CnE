import { CircleCheck, FolderSearch, Play } from 'lucide-react'
import type { ReactNode } from 'react'
import { pagedRows, pagedTotal, useFinishedPackages } from '../../data/queries'
import type { FinishedFilters, Lookup } from '../../data/selectors'
import type { PackageSummary } from '../../data/types'
import { EmptyState } from '../ui/EmptyState'
import { LoadMore, PageStatus } from '../ui/PageStatus'
import { Section } from '../ui/Section'
import { PackageTable, type PackageColumn } from './PackageTable'

interface PackageSectionsProps {
  lookup: Lookup
  now: Date
  /** Current work matching the filters (already filtered), or null when the filters exclude it. */
  active: PackageSummary[] | null
  /** Server filters for finished work, or null when the filters exclude it. */
  finished: FinishedFilters | null
  columns: PackageColumn[]
  caption: string
  action?: (pkg: PackageSummary) => ReactNode
  /** Shown when nothing matches, e.g. "Try another product or status." */
  emptyHint: string
}

/**
 * Packages in two parts: current work (complete, soonest deadline first) and
 * finished work (paged from the server, most recently finished first).
 */
export function PackageSections({ lookup, now, active, finished, columns, caption, action, emptyHint }: PackageSectionsProps) {
  const done = useFinishedPackages(finished ?? {}, finished !== null)
  const finishedRows = pagedRows(done.data)
  const total = pagedTotal(done.data)

  return (
    <div className="flex flex-col gap-5">
      {active && (
        <Section title={`Current work (${active.length})`} description="Soonest deadline first" flush>
          {active.length ? (
            <PackageTable lookup={lookup} packages={active} now={now} caption={`${caption}: current work`} columns={columns} action={action} />
          ) : (
            <EmptyState icon={finished ? Play : FolderSearch} title="No current work matches" compact>
              {emptyHint}
            </EmptyState>
          )}
        </Section>
      )}
      {finished && (
        <Section title={done.isPending ? 'Finished' : `Finished (${total})`} description="Most recently finished first" flush>
          {done.isPending || done.error ? (
            <PageStatus error={done.error?.message} retry={() => void done.refetch()} />
          ) : finishedRows.length ? (
            <>
              <PackageTable lookup={lookup} packages={finishedRows} now={now} caption={`${caption}: finished`} columns={columns} />
              <LoadMore
                shown={finishedRows.length}
                total={total}
                loading={done.isFetchingNextPage}
                onMore={() => void done.fetchNextPage()}
                noun="packages"
              />
            </>
          ) : (
            <EmptyState icon={CircleCheck} title="No finished work matches" compact>
              {emptyHint}
            </EmptyState>
          )}
        </Section>
      )}
    </div>
  )
}
