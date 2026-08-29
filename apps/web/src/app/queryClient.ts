import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/shared/lib/apiClient'

/**
 * One client for the app.
 *
 * `staleTime: 30s` deliberately mirrors the server's `Cache-Control: max-age`
 * on the aggregate endpoints. The two layers should not disagree: a client
 * that refetches every few seconds against a response the server told it to
 * cache for a minute just burns requests to receive 304s.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // The dashboard is not a live monitor. Refetching every time the reader
      // alt-tabs back is a steady background load that buys nothing.
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // A 4xx will fail identically however many times it is retried — the
        // request itself is wrong. Only retry what a retry could fix.
        if (error instanceof ApiError && error.status < 500) return false
        return failureCount < 2
      },
    },
    mutations: {
      // Never auto-retry a write: POST is not idempotent here, and a retried
      // create races the natural key into a spurious 409.
      retry: false,
    },
  },
})
