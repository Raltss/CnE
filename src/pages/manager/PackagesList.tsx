import { FilterX, FolderSearch, PackagePlus, Plus } from 'lucide-react'
import { useId, useState } from 'react'
import { AddProductDialog } from '../../components/domain/AddProductDialog'
import { Link, useSearchParams } from 'react-router'
import { PackageTable } from '../../components/domain/PackageTable'
import { ViewOnlyBanner } from '../../components/domain/ViewOnlyBanner'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader, Section } from '../../components/ui/Section'
import { useAppState, useNow } from '../../data/hooks'
import { EMPTY_FILTERS, editors, filterPackages, managers, type PackageFilters } from '../../data/selectors'
import { STATUS_META, WORKFLOW_STATUSES } from '../../lib/status'
import { buttonClasses, inputClasses } from '../../lib/styles'
import { useSession } from '../../session/context'

const KEYS = Object.keys(EMPTY_FILTERS) as Array<keyof PackageFilters>

function readFilters(params: URLSearchParams): PackageFilters {
  const f = { ...EMPTY_FILTERS }
  for (const key of KEYS) (f as Record<string, string>)[key] = params.get(key) ?? ''
  return f
}

export function PackagesList() {
  const state = useAppState()
  const now = useNow()
  const { me } = useSession()
  // Admins see the same list read-only: no create or edit actions.
  const canManage = me.role === 'manager'
  const [addingProduct, setAddingProduct] = useState<number | null>(null)
  const [params, setParams] = useSearchParams()
  const filters = readFilters(params)
  const results = filterPackages(state, filters, now)
  const uid = useId()
  const activeCount = KEYS.filter((k) => filters[k]).length

  // Filters live in the URL so every filtered view can be linked and bookmarked.
  const set = (key: keyof PackageFilters, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const select = (key: keyof PackageFilters, label: string, options: Array<{ value: string; label: string }>, all: string) => (
    <div className="min-w-0">
      <label htmlFor={`${uid}-${key}`} className="mb-1 block text-xs font-semibold text-muted-fg">
        {label}
      </label>
      <select id={`${uid}-${key}`} value={filters[key]} onChange={(e) => set(key, e.target.value)} className={inputClasses()}>
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <>
      <PageHeader
        title="Packages"
        description={
          canManage ? 'All packages across products. Both managers can manage every editor and package.' : 'All packages across products and editors.'
        }
        actions={
          canManage && (
            <>
              <button type="button" aria-haspopup="dialog" className={buttonClasses('secondary')} onClick={() => setAddingProduct(Date.now())}>
                <PackagePlus aria-hidden className="size-4" />
                Add product
              </button>
              <Link to="/packages/new" className={buttonClasses('primary')}>
                <Plus aria-hidden className="size-4" />
                New package
              </Link>
            </>
          )
        }
      />
      {!canManage && <ViewOnlyBanner />}

      <form role="search" aria-label="Filter packages" className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" onSubmit={(e) => e.preventDefault()}>
        <div className="min-w-0 sm:col-span-2 lg:col-span-3 xl:col-span-1">
          <label htmlFor={`${uid}-q`} className="mb-1 block text-xs font-semibold text-muted-fg">
            Search
          </label>
          <input
            id={`${uid}-q`}
            type="search"
            value={filters.q}
            onChange={(e) => set('q', e.target.value)}
            placeholder="Title or PKG code"
            className={inputClasses()}
          />
        </div>
        {select('product', 'Product', state.products.map((p) => ({ value: p.id, label: p.name })), 'All products')}
        {select('editor', 'Editor', editors(state).map((p) => ({ value: p.id, label: p.name })), 'All editors')}
        {select(
          'status',
          'Status',
          [{ value: 'active', label: 'All active' }, ...WORKFLOW_STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label }))],
          'Any status',
        )}
        {select('manager', 'Responsible manager', managers(state).map((p) => ({ value: p.id, label: p.name })), 'Any manager')}
        {select(
          'due',
          'Deadline',
          [
            { value: 'overdue', label: 'Overdue' },
            { value: '48h', label: 'Due in 48 hours' },
            { value: 'week', label: 'Due in 7 days' },
          ],
          'Any deadline',
        )}
      </form>

      <Section
        title={`${results.length} ${results.length === 1 ? 'package' : 'packages'}`}
        description={activeCount ? `${activeCount} filter${activeCount > 1 ? 's' : ''} applied` : 'Active work first, by deadline'}
        flush
        actions={
          activeCount > 0 && (
            <button type="button" className={buttonClasses('ghost', 'sm')} onClick={() => setParams({}, { replace: true })}>
              <FilterX aria-hidden className="size-4" />
              Clear filters
            </button>
          )
        }
      >
        {results.length ? (
          <PackageTable
            state={state}
            packages={results}
            now={now}
            caption="Packages"
            columns={['package', 'product', 'editor', 'manager', 'status', 'deadline']}
            action={(pkg) =>
              canManage &&
              pkg.status !== 'completed' && (
                <Link to={`/packages/${pkg.id}/edit`} className={buttonClasses('secondary', 'sm')} aria-label={`Edit ${pkg.title}`}>
                  Edit
                </Link>
              )
            }
          />
        ) : (
          <EmptyState
            icon={FolderSearch}
            title="No packages match these filters"
            action={
              <button type="button" className={buttonClasses('secondary')} onClick={() => setParams({}, { replace: true })}>
                Clear filters
              </button>
            }
          >
            Try a different product, editor, or status.
          </EmptyState>
        )}
      </Section>
      {addingProduct !== null && <AddProductDialog key={addingProduct} open onClose={() => setAddingProduct(null)} />}
    </>
  )
}
