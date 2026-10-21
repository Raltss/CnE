import { Bell, Clapperboard, Ellipsis, LogOut, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { ClockPill } from '../components/domain/ClockControls'
import { Dialog } from '../components/ui/Dialog'
import { useAppState, useNow } from '../data/hooks'
import { accessOf, isOverdue, unreadCount } from '../data/selectors'
import { api, dataMode } from '../data/store'
import type { AppState, Person } from '../data/types'
import { cx } from '../lib/styles'
import { useSession } from '../session/context'
import { DemoBar } from './DemoBar'
import { HOME, MOBILE_TAB_LIMIT, NAV, type NavItem } from './nav'

function badgeCount(item: NavItem, state: AppState, me: Person, now: Date) {
  if (item.badge === 'notifications') return unreadCount(state, me.id)
  if (item.badge === 'review') return state.packages.filter((p) => p.status === 'submitted').length
  if (item.badge === 'changes') return state.packages.filter((p) => p.editorId === me.id && p.status === 'apply_feedback').length
  if (item.badge === 'overdue') return state.packages.filter((p) => isOverdue(p, now)).length
  if (item.badge === 'pending') return state.accounts.filter((a) => accessOf(a) === 'pending').length
  return 0
}

function CountBadge({ count, label, className }: { count: number; label: string; className?: string }) {
  if (!count) return null
  return (
    <span
      className={cx(
        'inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] leading-5 font-bold text-on-accent tabular-nums',
        className,
      )}
    >
      {count}
      <span className="sr-only"> {label}</span>
    </span>
  )
}

const BADGE_LABEL = {
  notifications: 'unread',
  review: 'awaiting review',
  changes: 'need changes',
  overdue: 'overdue',
  pending: 'waiting for approval',
} as const

export function AppShell() {
  const state = useAppState()
  const { me, signOut } = useSession()
  const now = useNow()
  const doesWork = me.role !== 'admin'
  const items = NAV[me.role]
  const unread = unreadCount(state, me.id)
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
      {dataMode === 'demo' && <DemoBar />}
      <div className="flex flex-1">
        {/* Sidebar: icon rail on tablet, full on desktop */}
        <nav
          aria-label="Main"
          className="sticky top-0 hidden h-dvh w-16 shrink-0 flex-col border-r border-border bg-surface md:flex lg:w-60"
        >
          <Link to={HOME[me.role]} className="flex h-14 items-center gap-2 border-b border-border px-4 font-bold">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary text-on-primary">
              <Clapperboard aria-hidden className="size-4" />
            </span>
            <span className="hidden text-lg lg:inline">CnE</span>
            <span className="sr-only lg:hidden">CnE home</span>
          </Link>
          <ul className="flex flex-1 flex-col gap-1 p-2">
            {items.map((item) => {
              const Icon = item.icon
              const count = item.badge ? badgeCount(item, state, me, now) : 0
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    title={item.label}
                    className={({ isActive }) =>
                      cx(
                        'relative flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-150',
                        isActive ? 'bg-primary/10 text-primary' : 'text-muted-fg hover:bg-surface-2 hover:text-fg',
                      )
                    }
                  >
                    <Icon aria-hidden className="size-4 shrink-0" />
                    <span className="sr-only lg:not-sr-only lg:flex-1">{item.label}</span>
                    {item.badge && (
                      <CountBadge
                        count={count}
                        label={BADGE_LABEL[item.badge]}
                        className="absolute top-0.5 right-0.5 lg:static"
                      />
                    )}
                  </NavLink>
                </li>
              )
            })}
          </ul>
          <div className="hidden border-t border-border p-4 lg:block">
            <p className="truncate text-sm font-semibold">{me.name}</p>
            <p className="truncate text-xs text-muted-fg">
              {me.title && `${me.title} · `}
              <span className="capitalize">{me.role}</span>
            </p>
            <NavLink
              to="/account"
              className={({ isActive }) =>
                cx(
                  'mt-3 inline-flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-sm font-medium',
                  isActive ? 'bg-primary/10 text-primary' : 'text-muted-fg hover:bg-surface-2 hover:text-fg',
                )
              }
            >
              <UserRound aria-hidden className="size-4" />
              Your account
            </NavLink>
            {signOut && (
              <button
                type="button"
                onClick={() => void signOut()}
                className="mt-1 inline-flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-sm font-medium text-muted-fg hover:bg-surface-2 hover:text-fg"
              >
                <LogOut aria-hidden className="size-4" />
                Sign out
              </button>
            )}
          </div>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur">
            <div className="flex min-w-0 items-center gap-2">
              <Link to={HOME[me.role]} className="flex items-center gap-2 font-bold md:hidden">
                <span className="flex size-8 items-center justify-center rounded-md bg-primary text-on-primary">
                  <Clapperboard aria-hidden className="size-4" />
                </span>
                <span className="sr-only">CnE home</span>
              </Link>
              {/* The name doubles as the way to the account page (password) on small screens. */}
              <Link
                to="/account"
                title="Your account"
                className="min-w-0 truncate rounded-md text-sm underline-offset-2 hover:underline"
              >
                <span className="font-semibold">{me.name}</span>
                <span className="text-muted-fg capitalize"> · {me.role}</span>
                <span className="sr-only"> (your account)</span>
              </Link>
            </div>
            <div className="flex items-center gap-2">
              {doesWork && <ClockPill />}
              {doesWork && (
                <Link
                  to="/notifications"
                  className="relative flex size-10 items-center justify-center rounded-full text-muted-fg hover:bg-surface-2 hover:text-fg"
                  aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
                >
                  <Bell aria-hidden className="size-5" />
                  {unread > 0 && (
                    <span
                      aria-hidden
                      className="absolute top-0.5 right-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] leading-5 font-bold text-on-accent tabular-nums"
                    >
                      {unread}
                    </span>
                  )}
                </Link>
              )}
              {signOut && (
                <button
                  type="button"
                  onClick={() => void signOut()}
                  aria-label="Sign out"
                  title="Sign out"
                  className="flex size-10 items-center justify-center rounded-full text-muted-fg hover:bg-surface-2 hover:text-fg lg:hidden"
                >
                  <LogOut aria-hidden className="size-5" />
                </button>
              )}
            </div>
          </header>

          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1440px] flex-1 px-4 pt-5 pb-24 md:px-6 md:pb-10">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Mobile bottom tab bar (≤5 items) */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface md:hidden">
        <ul className={cx('grid', MOBILE_GRID[tabs.length + (overflow ? 1 : 0)])}>
          {tabs.map((item) => {
            const Icon = item.icon
            const count = item.badge ? badgeCount(item, state, me, now) : 0
            return (
              <li key={item.to}>
                <NavLink to={item.to} className={({ isActive }) => cx(mobileTabClasses, isActive ? 'text-primary' : 'text-muted-fg')}>
                  <Icon aria-hidden className="size-5" />
                  {item.short}
                  {item.badge && <CountBadge count={count} label={BADGE_LABEL[item.badge]} className="absolute top-1 right-[18%]" />}
                </NavLink>
              </li>
            )
          })}
          {overflow && (
            <li>
              <MoreMenu items={moreItems} state={state} me={me} now={now} />
            </li>
          )}
        </ul>
      </nav>
    </div>
  )
}

// Full class names so Tailwind generates them.
const MOBILE_GRID: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5' }

const mobileTabClasses = 'relative flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold'

/** Mobile-only overflow menu for nav items that don't fit in the bottom bar. */
function MoreMenu({ items, state, me, now }: { items: NavItem[]; state: AppState; me: Person; now: Date }) {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const active = items.some((item) => pathname.startsWith(item.to))
  const hiddenCount = items.reduce((sum, item) => sum + (item.badge ? badgeCount(item, state, me, now) : 0), 0)

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={cx(mobileTabClasses, active ? 'text-primary' : 'text-muted-fg')}
      >
        <Ellipsis aria-hidden className="size-5" />
        More
        <CountBadge count={hiddenCount} label="alerts in more menu" className="absolute top-1 right-[18%]" />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="More">
        <ul className="-mx-2 flex flex-col gap-1">
          {items.map((item) => {
            const Icon = item.icon
            const count = item.badge ? badgeCount(item, state, me, now) : 0
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cx(
                      'flex min-h-12 items-center gap-3 rounded-md px-3 text-base font-medium',
                      isActive ? 'bg-primary/10 text-primary' : 'text-fg hover:bg-surface-2',
                    )
                  }
                >
                  <Icon aria-hidden className="size-5 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && <CountBadge count={count} label={BADGE_LABEL[item.badge]} />}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </Dialog>
    </>
  )
}
