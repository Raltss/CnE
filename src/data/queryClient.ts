import { QueryClient } from '@tanstack/react-query'

/**
 * The cache for everything read from Supabase. Lists stay fresh through targeted
 * refreshes after changes (src/data/api.ts) and live updates (src/data/live.ts),
 * so a page reopened within a minute is served from memory. It is cleared when
 * someone signs out or a different person signs in (src/SignedInApp.tsx).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: true },
  },
})
