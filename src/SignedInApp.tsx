// The app after sign-in: data cache, live updates, and the router.
import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { useLiveUpdates } from './data/live'
import { queryClient } from './data/queryClient'
import { routes } from './routes'
import { useSession } from './session/context'

let currentRouter: ReturnType<typeof createBrowserRouter> | null = null

export default function SignedInApp() {
  const { me } = useSession()
  // A new router per sign-in (it starts from the current URL), so the next person doesn't
  // inherit the previous person's page. The previous router stops listening to history.
  const [router] = useState(() => createBrowserRouter(routes))
  useEffect(() => {
    if (currentRouter && currentRouter !== router) currentRouter.dispose()
    currentRouter = router
  }, [router])
  // Signing out, another person signing in, or an access change (AuthProvider) unmounts
  // this: drop everything cached, so nobody sees lists loaded for someone else.
  useEffect(() => () => queryClient.clear(), [me.id])
  return (
    <QueryClientProvider client={queryClient}>
      <LiveUpdates personId={me.id} />
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

function LiveUpdates({ personId }: { personId: string }) {
  useLiveUpdates(personId)
  return null
}
