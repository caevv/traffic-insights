import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/shared/lib/apiClient'

/**
 * One query client for the app.
 *
 * staleTime of 30s lines up with the server's Cache-Control max-age on the
 * aggregate routes. The two shouldn't disagree. A client refetching every few
 * seconds against a response the server said to cache for a minute just burns
 * requests to get 304s back.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // This is not a live monitor. Refetching every time someone alt-tabs
      // back is constant background load for nothing.
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // A 4xx fails the same way however many times you retry. The request
        // itself is wrong. Only retry things a retry could fix.
        if (error instanceof ApiError && error.status < 500) return false
        return failureCount < 2
      },
    },
    mutations: {
      // Never auto-retry a write. POST isn't idempotent here, so a retried
      // create just hits the natural key and gives a confusing 409.
      retry: false,
    },
  },
})
