import { ToastProvider } from './components/ui/ToastProvider'
import { startSession } from './data/queries'
import { supabase } from './lib/supabase'
import { StatusScreen } from './pages/auth/AuthLayout'
import { AuthProvider } from './session/AuthProvider'
import SignedInApp from './SignedInApp'

// The signed-in app and the three home pages ship in the first download: most
// visits are by someone already signed in, and a separate download for them
// slowed the first screen more than it sped up the sign-in page (Lighthouse,
// 2026-10-21). The other pages are separate downloads (routes.tsx).

export default function App() {
  if (!supabase)
    return (
      <StatusScreen
        title="Supabase isn’t configured"
        error
        message={
          <>
            Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to <code>.env.local</code> and restart{' '}
            <code>npm run dev</code>.
          </>
        }
      />
    )

  return (
    <ToastProvider>
      <AuthProvider supabase={supabase} onSignedIn={startSession}>
        <SignedInApp />
      </AuthProvider>
    </ToastProvider>
  )
}
