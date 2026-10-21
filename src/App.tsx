import { createBrowserRouter, RouterProvider } from 'react-router'
import { ToastProvider } from './components/ui/ToastProvider'
import { dataMode } from './data/store'
import { supabase } from './lib/supabase'
import { StatusScreen } from './pages/auth/AuthLayout'
import { routes } from './routes'
import { AuthProvider } from './session/AuthProvider'
import { DemoSessionProvider } from './session/DemoSessionProvider'

const router = createBrowserRouter(routes)

export default function App() {
  if (dataMode === 'unconfigured')
    return (
      <StatusScreen
        title="Supabase isn’t configured"
        error
        message={
          <>
            Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to <code>.env.local</code> and restart{' '}
            <code>npm run dev</code>. To try the offline demo instead, set <code>VITE_USE_DEMO_DATA=true</code>.
          </>
        }
      />
    )

  return (
    <ToastProvider>
      {dataMode === 'demo' ? (
        <DemoSessionProvider>
          <RouterProvider router={router} />
        </DemoSessionProvider>
      ) : (
        <AuthProvider supabase={supabase!}>
          <RouterProvider router={router} />
        </AuthProvider>
      )}
    </ToastProvider>
  )
}
