import { lazy, type ComponentType } from 'react'
import type { RouteObject } from 'react-router'
import { AppShell } from './layout/AppShell'
import { AdminOverview } from './pages/admin/Overview'
import { MyWork } from './pages/editor/MyWork'
import { ManagerDashboard } from './pages/manager/Dashboard'
import { NotFound } from './pages/NotFound'
import { RoleGuard, RoleHome } from './pages/RoleGuard'

// The three home pages ship with the app, since nearly every visit starts on one.
// Every other page is its own download, fetched the first time it's opened;
// AppShell shows the navigation right away and a loading state while it arrives.
const page = <T extends Record<string, unknown>>(load: () => Promise<T>, name: keyof T) =>
  lazy(() => load().then((module) => ({ default: module[name] as ComponentType })))

const ReviewQueue = page(() => import('./pages/manager/ReviewQueue'), 'ReviewQueue')
const Deadlines = page(() => import('./pages/manager/Deadlines'), 'Deadlines')
const PackagesList = page(() => import('./pages/manager/PackagesList'), 'PackagesList')
const PackageFormPage = page(() => import('./pages/manager/PackageForm'), 'PackageFormPage')
const NeedsChanges = page(() => import('./pages/editor/NeedsChanges'), 'NeedsChanges')
const History = page(() => import('./pages/editor/History'), 'History')
const PackageDetail = page(() => import('./pages/PackageDetail'), 'PackageDetail')
const TimeClock = page(() => import('./pages/TimeClock'), 'TimeClock')
const Attendance = page(() => import('./pages/Attendance'), 'Attendance')
const Notifications = page(() => import('./pages/Notifications'), 'Notifications')
const Account = page(() => import('./pages/Account'), 'Account')
const Team = page(() => import('./pages/admin/Team'), 'Team')
const PersonDetail = page(() => import('./pages/admin/PersonDetail'), 'PersonDetail')
const Staff = page(() => import('./pages/admin/Staff'), 'Staff')

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <RoleHome /> },
      { path: 'account', element: <Account /> },
      {
        element: <RoleGuard roles={['manager']} />,
        children: [
          { path: 'dashboard', element: <ManagerDashboard /> },
          { path: 'review', element: <ReviewQueue /> },
          { path: 'deadlines', element: <Deadlines /> },
          { path: 'packages/new', element: <PackageFormPage /> },
          { path: 'packages/:id/edit', element: <PackageFormPage /> },
        ],
      },
      {
        element: <RoleGuard roles={['editor']} />,
        children: [
          { path: 'my-work', element: <MyWork /> },
          { path: 'needs-changes', element: <NeedsChanges /> },
          { path: 'history', element: <History /> },
        ],
      },
      {
        element: <RoleGuard roles={['manager', 'editor']} />,
        children: [
          { path: 'time-clock', element: <TimeClock /> },
          { path: 'notifications', element: <Notifications /> },
        ],
      },
      // Admins see these read-only (RLS gives them read access, the workflow functions refuse their writes).
      {
        element: <RoleGuard roles={['manager', 'admin']} />,
        children: [{ path: 'packages', element: <PackagesList /> }],
      },
      {
        element: <RoleGuard roles={['manager', 'editor', 'admin']} />,
        children: [
          { path: 'packages/:id', element: <PackageDetail /> },
          { path: 'attendance', element: <Attendance /> },
        ],
      },
      {
        element: <RoleGuard roles={['admin']} />,
        children: [
          { path: 'overview', element: <AdminOverview /> },
          { path: 'team', element: <Team /> },
          { path: 'team/:id', element: <PersonDetail /> },
          { path: 'staff', element: <Staff /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]
