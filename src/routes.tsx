import type { RouteObject } from 'react-router'
import { AppShell } from './layout/AppShell'
import { Account } from './pages/Account'
import { Attendance } from './pages/Attendance'
import { History } from './pages/editor/History'
import { MyWork } from './pages/editor/MyWork'
import { NeedsChanges } from './pages/editor/NeedsChanges'
import { ManagerDashboard } from './pages/manager/Dashboard'
import { Deadlines } from './pages/manager/Deadlines'
import { PackageFormPage } from './pages/manager/PackageForm'
import { PackagesList } from './pages/manager/PackagesList'
import { ReviewQueue } from './pages/manager/ReviewQueue'
import { NotFound } from './pages/NotFound'
import { Notifications } from './pages/Notifications'
import { PackageDetail } from './pages/PackageDetail'
import { AdminOverview } from './pages/admin/Overview'
import { PersonDetail } from './pages/admin/PersonDetail'
import { Staff } from './pages/admin/Staff'
import { Team } from './pages/admin/Team'
import { RoleGuard, RoleHome } from './pages/RoleGuard'
import { TimeClock } from './pages/TimeClock'

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
