// The app after sign-in: data cache, live updates, and the router.
import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { useLiveUpdates } from './data/live'
import { queryClient } from './data/queryClient'
import { routes } from './routes'
import { useSession } from './session/context'

const router = createBrowserRouter(routes)

export default function SignedInApp() {
  const { me } = useSession()
  // Signing out, or another person signing in, unmounts this: drop everything cached for this person.
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
