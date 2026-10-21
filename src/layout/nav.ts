import {
  Bell,
  CalendarClock,
  Clock,
  FolderKanban,
  History,
  Inbox,
  LayoutDashboard,
  ListTodo,
  RotateCcw,
  Timer,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '../data/types'

export interface NavItem {
  to: string
  label: string
  /** Shorter label for the mobile bottom bar. */
  short: string
  icon: LucideIcon
  badge?: 'review' | 'changes' | 'notifications' | 'overdue' | 'pending'
}

/** The mobile bottom bar holds at most 5 tabs; extra items move into a "More" menu. */
export const MOBILE_TAB_LIMIT = 5

export const NAV: Record<Role, NavItem[]> = {
  // Admins oversee everyone's work read-only and manage staff access (PRD §2); they don't clock in.
  admin: [
    { to: '/overview', label: 'Overview', short: 'Overview', icon: LayoutDashboard },
    { to: '/team', label: 'Team', short: 'Team', icon: Users },
    { to: '/packages', label: 'Packages', short: 'Packages', icon: FolderKanban },
    { to: '/attendance', label: 'Attendance', short: 'Attendance', icon: Clock },
    { to: '/staff', label: 'Staff & Roles', short: 'Staff', icon: UserCog, badge: 'pending' },
  ],
  manager: [
    { to: '/dashboard', label: 'Dashboard', short: 'Home', icon: LayoutDashboard },
    { to: '/review', label: 'Review Queue', short: 'Review', icon: Inbox, badge: 'review' },
    { to: '/deadlines', label: 'Deadlines', short: 'Deadlines', icon: CalendarClock, badge: 'overdue' },
    { to: '/packages', label: 'Packages', short: 'Packages', icon: FolderKanban },
    { to: '/time-clock', label: 'Time Clock', short: 'Clock', icon: Timer },
    { to: '/attendance', label: 'Attendance', short: 'Attendance', icon: Clock },
    { to: '/notifications', label: 'Notifications', short: 'Alerts', icon: Bell, badge: 'notifications' },
  ],
  editor: [
    { to: '/my-work', label: 'My Work', short: 'My Work', icon: ListTodo },
    { to: '/needs-changes', label: 'Needs Changes', short: 'Changes', icon: RotateCcw, badge: 'changes' },
    { to: '/history', label: 'History', short: 'History', icon: History },
    { to: '/attendance', label: 'Attendance', short: 'Time', icon: Clock },
    { to: '/notifications', label: 'Notifications', short: 'Alerts', icon: Bell, badge: 'notifications' },
  ],
}

export const HOME: Record<Role, string> = { admin: '/overview', manager: '/dashboard', editor: '/my-work' }
