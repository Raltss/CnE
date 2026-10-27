import { KeyRound, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AddUserDialog } from '../../components/domain/AddUserDialog'
import { StaffAccessDialog } from '../../components/domain/StaffAccessDialog'
import { StaffActivityList } from '../../components/domain/StaffActivityList'
import { AccessBadge, RoleBadge } from '../../components/domain/StatusBadge'
import { Callout } from '../../components/ui/Callout'
import { EmptyState } from '../../components/ui/EmptyState'
import { LoadMore, PageStatus } from '../../components/ui/PageStatus'
import { PageHeader, Section } from '../../components/ui/Section'
import { TabNav } from '../../components/ui/TabNav'
import { pagedRows, pagedTotal, useAccounts, useStaffActivity } from '../../data/queries'
import { accessOf, type Access } from '../../data/selectors'
import type { StaffAccount } from '../../data/types'
import { buttonClasses } from '../../lib/styles'
import { formatDate } from '../../lib/time'
import { useSession } from '../../session/context'

const FILTERS: Array<{ id: '' | Access; label: string }> = [
  { id: '', label: 'All' },
  { id: 'pending', label: 'Waiting' },
  { id: 'active', label: 'Active' },
  { id: 'deactivated', label: 'Deactivated' },
]

/** Who can be managed from the app: approved managers/editors and waiting accounts, never yourself or an admin. */
const manageable = (a: StaffAccount, meId: string) => a.id !== meId && a.role !== 'admin'

/** Admin home for accounts: who can sign in, their role and access, and the audited changes. */
export function Staff() {
  const accountsQuery = useAccounts()
  const historyQuery = useStaffActivity()
  const { me } = useSession()
  const [params, setParams] = useSearchParams()
  const filter = (params.get('access') ?? '') as '' | Access
  const managingId = params.get('manage')
  // A new key per opening, so the Add user form always starts empty.
  const [adding, setAdding] = useState<number | null>(null)

  // Waiting accounts first, then by name.
  const allAccounts = accountsQuery.data ?? []
  const accounts = [...allAccounts].sort(
    (a, b) => Number(accessOf(b) === 'pending') - Number(accessOf(a) === 'pending') || a.name.localeCompare(b.name),
  )
  const shown = accounts.filter((a) => !filter || accessOf(a) === filter)
  const count = (id: '' | Access) => (id ? accounts.filter((a) => accessOf(a) === id).length : accounts.length)
  const managing = managingId ? (allAccounts.find((a) => a.id === managingId) ?? null) : null
  const history = pagedRows(historyQuery.data)
  const historyTotal = pagedTotal(historyQuery.data)

  // The dialog's account is in the URL, so "Manage access" links can open it directly.
  const setManaging = (id: string | null) => {
    const next = new URLSearchParams(params)
    if (id) next.set('manage', id)
    else next.delete('manage')
    setParams(next, { replace: true })
  }

  return (
    <>
      <PageHeader
        title="Staff & Roles"
        description="Everyone who can sign in to CnE, their role, and whether they have access."
        actions={
          <button type="button" aria-haspopup="dialog" className={buttonClasses('primary')} onClick={() => setAdding(Date.now())}>
            <UserPlus aria-hidden className="size-4" />
            Add user
          </button>
        }
      />
      <div className="mb-6">
        <Callout tone="info" title="Changes here are real and recorded under your name">
          Add managers and editors, approve waiting accounts, switch someone between manager and editor, or deactivate and reactivate access. Admin access
          is granted only in the Supabase SQL editor; see <code>docs/supabase-setup.md</code>.
        </Callout>
      </div>

      <TabNav
        label="Filter accounts by access"
        param="access"
        current={filter}
        tabs={FILTERS.map((f) => ({ id: f.id, label: f.label, count: count(f.id) }))}
      />

      <div className="grid gap-6 xl:grid-cols-5 xl:items-start">
        <Section
          title={`${shown.length} ${shown.length === 1 ? 'account' : 'accounts'}`}
          description={count('pending') ? `${count('pending')} waiting for approval` : 'Nobody is waiting for approval'}
          className="xl:col-span-3"
          flush
        >
          {accountsQuery.data === undefined ? (
            <PageStatus error={accountsQuery.error?.message} retry={() => void accountsQuery.refetch()} />
          ) : shown.length ? (
            <ul className="divide-y divide-border">
              {shown.map((a) => (
                <li key={a.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      {a.role && a.role !== 'admin' ? (
                        <Link to={`/team/${a.id}`} className="font-medium text-fg decoration-border-strong underline-offset-4 hover:underline">
                          {a.name}
                        </Link>
                      ) : (
                        <span className="font-semibold">{a.name}</span>
                      )}
                      {a.id === me.id && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-fg">You</span>}
                    </p>
                    <p className="truncate text-sm text-muted-fg">
                      {a.email}
                      {a.title && ` · ${a.title}`}
                    </p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-fg">
                      <RoleBadge role={a.role} />
                      <AccessBadge account={a} />
                      {a.mustChangePassword && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-info-bg px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-info">
                          <KeyRound aria-hidden className="size-3.5" strokeWidth={2.5} />
                          Temporary password
                        </span>
                      )}
                      <span>added {formatDate(a.createdAt)}</span>
                    </p>
                  </div>
                  {manageable(a, me.id) ? (
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      className={buttonClasses(accessOf(a) === 'pending' ? 'primary' : 'secondary', 'sm', 'shrink-0 self-start sm:self-center')}
                      onClick={() => setManaging(a.id)}
                    >
                      {accessOf(a) === 'pending' ? 'Approve…' : 'Manage access'}
                      <span className="sr-only"> for {a.name}</span>
                    </button>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-fg">{a.id === me.id ? 'That’s you' : 'Managed in the SQL editor'}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Users} title="No accounts match" compact>
              {filter === 'pending' ? 'Nobody is waiting for approval.' : 'Try another filter.'}
            </EmptyState>
          )}
        </Section>

        <Section title="Account history" description="Every role and access change, newest first" className="xl:col-span-2" flush>
          {historyQuery.data === undefined ? (
            <PageStatus error={historyQuery.error?.message} retry={() => void historyQuery.refetch()} />
          ) : (
            <StaffActivityList accounts={allAccounts} entries={history} showAccount label="Account history" />
          )}
          <LoadMore
            shown={history.length}
            total={historyTotal}
            loading={historyQuery.isFetchingNextPage}
            onMore={() => void historyQuery.fetchNextPage()}
            noun="changes"
          />
        </Section>
      </div>

      {adding !== null && (
        <AddUserDialog key={adding} open accounts={allAccounts} me={me} onClose={() => setAdding(null)} />
      )}
      <StaffAccessDialog
        key={managing?.id ?? 'none'}
        accounts={allAccounts}
        account={managing && manageable(managing, me.id) ? managing : null}
        me={me}
        onClose={() => setManaging(null)}
      />
    </>
  )
}
