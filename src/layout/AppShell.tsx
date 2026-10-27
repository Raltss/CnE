import { Bell, Ellipsis, LogOut } from 'lucide-react'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { ClockPill } from '../components/domain/ClockControls'
import { BrandMark } from '../components/ui/BrandMark'
import { Dialog } from '../components/ui/Dialog'
import { PageStatus } from '../components/ui/PageStatus'
import { ThemeToggle } from '../components/ui/ThemeToggle'
import { api } from '../data/api'
import { useNow } from '../data/hooks'
import { useAccounts, useActiveWork, useUnreadCount } from '../data/queries'
import { accessOf, isOverdue } from '../data/selectors'
import type { PackageSummary, Person } from '../data/types'
import { initials } from '../lib/initials'
import { cx } from '../lib/styles'
import { formatClock, formatDayKey, manilaDateKey } from '../lib/time'
import { useSession } from '../session/context'
import { HOME, MOBILE_TAB_LIMIT, NAV, type NavItem } from './nav'

type BadgeCounts = Record<NonNullable<NavItem['badge']>, number>

/**
 * Nav badge numbers. Each comes from a small read (a count, or a summary of
 * current work); `select` keeps the shell from re-rendering unless a number changes.
 */
function useBadgeCounts(me: Person, now: Date): BadgeCounts {
  const doesWork = me.role !== 'admin'
  const work = useActiveWork({
    enabled: doesWork,
    select: useCallback(
      (rows: PackageSummary[]) => ({
        review: rows.filter((p) => p.status === 'submitted').length,
        changes: rows.filter((p) => p.editorId === me.id && p.status === 'apply_feedback').length,
        overdue: rows.filter((p) => isOverdue(p, now)).length,
      }),
      [me.id, now],
    ),
  })
  const unread = useUnreadCount(me.id, doesWork)
  const accounts = useAccounts(me.role === 'admin')
  return {
    review: work.data?.review ?? 0,
    changes: work.data?.changes ?? 0,
    overdue: work.data?.overdue ?? 0,
    notifications: unread.data ?? 0,
    pending: accounts.data?.filter((a) => accessOf(a) === 'pending').length ?? 0,
  }
}

const badgeCount = (item: NavItem, counts: BadgeCounts) => (item.badge ? counts[item.badge] : 0)

const BADGE_LABEL = {
  notifications: 'unread',
  review: 'awaiting review',
  changes: 'need changes',
  overdue: 'overdue',
  pending: 'waiting for approval',
} as const

/**
 * A count beside a nav item. Quiet mono figures, except late work, which takes the playhead color.
 * `chip` is the small bubble used where there's no room for the label (icon rail, phone tabs).
 */
function CountBadge({ count, label, late, chip, className }: { count: number; label: string; late?: boolean; chip?: boolean; className?: string }) {
  if (!count) return null
  return (
    <span
      className={cx(
        'text-xs leading-5 tabular-nums',
        chip || late
          ? cx('inline-flex min-w-5 items-center justify-center rounded-full px-1.5 font-medium', late ? 'bg-now text-on-now' : 'bg-chrome-strong text-chrome')
          : 'text-chrome-muted',
        className,
      )}
    >
      {count}
      <span className="sr-only"> {label}</span>
    </span>
  )
}

export function AppShell() {
  const { me, signOut } = useSession()
  const now = useNow()
  const doesWork = me.role !== 'admin'
  const items = NAV[me.role]
  const counts = useBadgeCounts(me, now)
  const unread = counts.notifications
  // Keep the bottom bar at 5 tabs: the first 4 items plus "More" when there are extras.
  const overflow = items.length > MOBILE_TAB_LIMIT
  const tabs = overflow ? items.slice(0, MOBILE_TAB_LIMIT - 1) : items
  const moreItems = overflow ? items.slice(MOBILE_TAB_LIMIT - 1) : []

  // Apply the 16-hour auto-close while the app stays open (admins have no attendance).
  useEffect(() => {
    if (!doesWork) return
    void api.sweepAttendance()
    const id = window.setInterval(() => void api.sweepAttendance(), 60_000)
    return () => window.clearInterval(id)
  }, [doesWork])

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-on-primary focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <div className="flex flex-1">
        {/* Sidebar in the bay color: icon rail on tablet, full on desktop. The column carries the
            color the full height of the page; the nav inside stays in view. */}
        <div className="chrome hidden w-16 shrink-0 md:block lg:w-60">
          <nav aria-label="Main" className="sticky top-0 flex h-dvh flex-col">
            <Link to={HOME[me.role]} className="flex h-14 shrink-0 items-center px-5 text-chrome-strong lg:px-4">
              <BrandMark wordmark={false} className="lg:hidden" />
              <BrandMark className="hidden lg:inline-flex" />
              <span className="sr-only">CnE home</span>
            </Link>
            <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pt-2">
              {items.map((item) => {
                const Icon = item.icon
                const count = badgeCount(item, counts)
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      title={item.label}
                      className={({ isActive }) =>
                        cx(
                          'relative flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-120',
                          isActive ? 'bg-chrome-3 text-chrome-strong' : 'text-chrome-fg hover:bg-chrome-2 hover:text-chrome-strong',
                        )
                      }
                    >
                      <Icon aria-hidden className="size-4 shrink-0" />
                      <span className="sr-only lg:not-sr-only lg:flex-1">{item.label}</span>
                      {item.badge && (
                        <>
                          <CountBadge count={count} label={BADGE_LABEL[item.badge]} late={item.badge === 'overdue'} className="hidden lg:inline-flex" />
                          <CountBadge count={count} label={BADGE_LABEL[item.badge]} late={item.badge === 'overdue'} chip className="absolute -top-0.5 right-0 lg:hidden" />
                        </>
                      )}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
            <div className="flex items-center gap-1 border-t border-chrome-line p-2">
              <NavLink
                to="/account"
                title="Your account"
                className={({ isActive }) =>
                  cx(
                    'flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-md px-3 transition-colors duration-120 lg:px-2',
                    isActive ? 'bg-chrome-3' : 'hover:bg-chrome-2',
                  )
                }
              >
                <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-chrome-3 text-xs font-medium text-chrome-strong">
                  {initials(me.name)}
                </span>
                <span className="hidden min-w-0 flex-col lg:flex">
                  <span className="truncate text-sm font-medium text-chrome-strong">{me.name}</span>
                  <span className="truncate text-sm text-chrome-muted">{me.title || <span className="capitalize">{me.role}</span>}</span>
                </span>
                <span className="sr-only lg:hidden">Your account</span>
              </NavLink>
              <button
                type="button"
                onClick={() => void signOut()}
                aria-label="Sign out"
                title="Sign out"
                className="hidden size-10 shrink-0 items-center justify-center rounded-md text-chrome-muted transition-colors duration-120 hover:bg-chrome-2 hover:text-chrome-strong lg:flex"
              >
                <LogOut aria-hidden className="size-4" />
              </button>
            </div>
          </nav>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="chrome sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-chrome-line px-4 md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Link to={HOME[me.role]} className="flex items-center text-chrome-strong md:hidden">
                <BrandMark wordmark={false} />
                <span className="sr-only">CnE home</span>
              </Link>

              <p className="hidden text-sm text-chrome-fg md:block">
                {formatDayKey(manilaDateKey(now.toISOString()))}
                <span className="ml-2 font-medium text-chrome-strong tabular-nums">{formatClock(now)}</span>
                <span className="ml-1 text-chrome-muted">PHT</span>
              </p>
            </div>
            <div className="flex items-center gap-1">
              {doesWork && <ClockPill />}
              <ThemeToggle tone="chrome" className="max-md:hidden" />
              {doesWork && (
                <Link
                  to="/notifications"
                  className="relative flex size-10 items-center justify-center rounded-md text-chrome-fg transition-colors duration-120 hover:bg-chrome-2 hover:text-chrome-strong"
                  aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
                >
                  <Bell aria-hidden className="size-4.5" />
                  {unread > 0 && (
                    <span
                      aria-hidden
                      className="absolute top-1 right-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-chrome-strong px-1 text-xs leading-5 font-medium text-chrome tabular-nums"
                    >
                      {unread}
                    </span>
                  )}
                </Link>
              )}
              <button
                type="button"
                onClick={() => void signOut()}
                aria-label="Sign out"
                title="Sign out"
                className="hidden size-10 items-center justify-center rounded-md text-chrome-fg transition-colors duration-120 hover:bg-chrome-2 hover:text-chrome-strong md:flex lg:hidden"
              >
                <LogOut aria-hidden className="size-4.5" />
              </button>
              {/* Phones: the way to Your account (profile, theme, password, sign out). */}
              <Link
                to="/account"
                title="Your account"
                className="ml-1 flex size-10 items-center justify-center rounded-full md:hidden"
              >
                <span aria-hidden className="flex size-8 items-center justify-center rounded-full bg-chrome-3 text-xs font-medium text-chrome-strong">
                  {initials(me.name)}
                </span>
                <span className="sr-only">Your account ({me.name})</span>
              </Link>
            </div>
          </header>

          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-10 outline-none md:px-8 md:pt-8 md:pb-12">
            <Suspense fallback={<PageStatus />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>

      {/* Mobile bottom tab bar (≤5 items), in the bay color like the top bar */}
      <nav aria-label="Main" className="chrome sticky bottom-0 z-30 border-t border-chrome-line pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className={cx('grid', MOBILE_GRID[tabs.length + (overflow ? 1 : 0)])}>
          {tabs.map((item) => {
            const Icon = item.icon
            const count = badgeCount(item, counts)
            return (
              <li key={item.to}>
                <NavLink to={item.to} className={({ isActive }) => cx(mobileTabClasses, isActive ? 'text-chrome-strong' : 'text-chrome-muted')}>
                  {({ isActive }) => (
                    <>
                      <span aria-hidden className={cx('flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-180', isActive && 'bg-chrome-3')}>
                        <Icon className="size-5" />
                      </span>
                      {item.short}
                      {item.badge && (
                        <CountBadge count={count} label={BADGE_LABEL[item.badge]} late={item.badge === 'overdue'} chip className="absolute top-1 left-1/2 ml-2" />
                      )}
                    </>
                  )}
                </NavLink>
              </li>
            )
          })}
          {overflow && (
            <li>
              <MoreMenu items={moreItems} counts={counts} />
            </li>
          )}
        </ul>
      </nav>
    </div>
  )
}

// Full class names so Tailwind generates them.
const MOBILE_GRID: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5' }

const mobileTabClasses = 'relative flex min-h-16 w-full flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors duration-120'

/** Mobile-only overflow menu for nav items that don't fit in the bottom bar. */
function MoreMenu({ items, counts }: { items: NavItem[]; counts: BadgeCounts }) {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const active = items.some((item) => pathname.startsWith(item.to))
  const hiddenCount = items.reduce((sum, item) => sum + badgeCount(item, counts), 0)

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={cx(mobileTabClasses, active ? 'text-chrome-strong' : 'text-chrome-muted')}
      >
        <span aria-hidden className={cx('flex h-7 w-12 items-center justify-center rounded-full', active && 'bg-chrome-3')}>
          <Ellipsis className="size-5" />
        </span>
        More
        <CountBadge count={hiddenCount} label="alerts in more menu" chip className="absolute top-1 left-1/2 ml-2" />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="More">
        <ul className="-mx-2 flex flex-col gap-0.5">
          {items.map((item) => {
            const Icon = item.icon
            const count = badgeCount(item, counts)
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cx(
                      'flex min-h-12 items-center gap-3 rounded-md px-3 text-base font-medium transition-colors duration-120',
                      isActive ? 'bg-surface-2 text-fg' : 'text-fg hover:bg-surface-2',
                    )
                  }
                >
                  <Icon aria-hidden className="size-5 shrink-0 text-muted-fg" />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && count > 0 && (
                    <span className={cx('text-sm tabular-nums', item.badge === 'overdue' ? 'font-medium text-now' : 'text-muted-fg')}>
                      {count}
                      <span className="sr-only"> {BADGE_LABEL[item.badge]}</span>
                    </span>
                  )}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </Dialog>
    </>
  )
}
