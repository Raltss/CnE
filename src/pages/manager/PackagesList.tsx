import { FilterX, Plus, SlidersHorizontal, Tags } from 'lucide-react'
import { useId, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { ProductsDialog } from '../../components/domain/ProductsDialog'
import { PackageSections } from '../../components/domain/PackageSections'
import { ViewOnlyBanner } from '../../components/domain/ViewOnlyBanner'
import { PageStatus } from '../../components/ui/PageStatus'
import { PageHeader } from '../../components/ui/Section'
import { useDebouncedValue, useNow } from '../../data/hooks'
import { pageStatus, useActiveWork, useDirectory } from '../../data/queries'
import {
  EMPTY_FILTERS,
  FINISHED_STATUSES,
  editors,
  filterActive,
  managers,
  showsActive,
  showsFinished,
  type PackageFilters,
} from '../../data/selectors'
import type { PackageStatus } from '../../data/types'
import { backState } from '../../lib/back'
import { STATUS_META, WORKFLOW_STATUSES } from '../../lib/status'
import { buttonClasses, cx, inputClasses } from '../../lib/styles'
import { useSession } from '../../session/context'

const KEYS = Object.keys(EMPTY_FILTERS) as Array<keyof PackageFilters>

function readFilters(params: URLSearchParams): PackageFilters {
  const f = { ...EMPTY_FILTERS }
  for (const key of KEYS) (f as Record<string, string>)[key] = params.get(key) ?? ''
  return f
}

export function PackagesList() {
  const now = useNow()
  const { me } = useSession()
  // Admins see the same list read-only: no create or edit actions.
  const canManage = me.role === 'manager'
  // A new key per opening, so the Products dialog's fields start empty.
  const [managingProducts, setManagingProducts] = useState<number | null>(null)
  const [params, setParams] = useSearchParams()
  // Pages opened from here (a package, Edit, New package) come back to this list, filters included.
  const fromHere = backState(useLocation(), 'Packages')
  const filters = readFilters(params)
  // The search box queries the server for finished work; wait until typing pauses.
  const search = useDebouncedValue(filters.q)
  const uid = useId()
  const activeCount = KEYS.filter((k) => filters[k]).length
  const [showFilters, setShowFilters] = useState(false)
  const work = useActiveWork()
  const { people, products, lookup, queries } = useDirectory()

  // Filters live in the URL so every filtered view can be linked and bookmarked.
  const set = (key: keyof PackageFilters, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const status = pageStatus(work, ...queries)
  const select = (key: keyof PackageFilters, label: string, options: Array<{ value: string; label: string }>, all: string) => (
    <div className="min-w-0">
      <label htmlFor={`${uid}-${key}`} className="mb-1.5 block text-sm font-medium text-muted-fg">
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
              <button type="button" aria-haspopup="dialog" className={buttonClasses('secondary')} onClick={() => setManagingProducts(Date.now())}>
                <Tags aria-hidden className="size-4" />
                Products
              </button>
              <Link to="/packages/new" state={fromHere} className={buttonClasses('primary')}>
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
          <label htmlFor={`${uid}-q`} className="mb-1.5 block text-sm font-medium text-muted-fg">
            Search
          </label>
          <div className="flex gap-2">
            <input
              id={`${uid}-q`}
              type="search"
              value={filters.q}
              onChange={(e) => set('q', e.target.value)}
              placeholder="Title or PKG code"
              className={inputClasses()}
            />
            {/* Phones: the other filters fold away behind this button. */}
            <button
              type="button"
              aria-expanded={showFilters}
              aria-controls={`${uid}-filters`}
              onClick={() => setShowFilters((v) => !v)}
              className={buttonClasses('secondary', 'md', 'shrink-0 md:hidden')}
            >
              <SlidersHorizontal aria-hidden />
              Filters
              {activeCount - (filters.q ? 1 : 0) > 0 && <span className="font-mono text-muted-fg">{activeCount - (filters.q ? 1 : 0)}</span>}
            </button>
          </div>
        </div>
        <div id={`${uid}-filters`} className={cx('contents', !showFilters && 'max-md:hidden')}>
          {select('product', 'Product', products.map((p) => ({ value: p.id, label: p.name })), 'All products')}
          {select('editor', 'Editor', editors(people).map((p) => ({ value: p.id, label: p.name })), 'All editors')}
          {select(
            'status',
            'Status',
            [{ value: 'active', label: 'All active' }, ...WORKFLOW_STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label }))],
            'Any status',
          )}
          {select('manager', 'Responsible manager', managers(people).map((p) => ({ value: p.id, label: p.name })), 'Any manager')}
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
        </div>
      </form>
      {activeCount > 0 && (
        <div className="mb-4 flex justify-end">
          <button type="button" className={buttonClasses('ghost', 'sm')} onClick={() => setParams({}, { replace: true })}>
            <FilterX aria-hidden className="size-4" />
            Clear {activeCount} {activeCount === 1 ? 'filter' : 'filters'}
          </button>
        </div>
      )}

      {status.pending || status.error ? (
        <PageStatus {...status} />
      ) : (
        <PackageSections
          lookup={lookup}
          now={now}
          active={showsActive(filters) ? filterActive(work.data!, filters, now) : null}
          finished={
            showsFinished(filters)
              ? {
                  q: search,
                  product: filters.product,
                  editor: filters.editor,
                  manager: filters.manager,
                  status: FINISHED_STATUSES.includes(filters.status as PackageStatus) ? (filters.status as PackageStatus) : undefined,
                }
              : null
          }
          linkState={fromHere}
          caption="Packages"
          columns={['package', 'product', 'editor', 'manager', 'status', 'deadline']}
          emptyHint="Try a different product, editor, or status."
          action={(pkg) =>
            // Archived packages are unarchived from their page before editing.
            canManage &&
            pkg.status !== 'archived' && (
              <Link to={`/packages/${pkg.id}/edit`} state={fromHere} className={buttonClasses('secondary', 'sm')} aria-label={`Edit ${pkg.title}`}>
                Edit
              </Link>
            )
          }
        />
      )}
      {managingProducts !== null && <ProductsDialog key={managingProducts} open onClose={() => setManagingProducts(null)} />}
    </>
  )
}
