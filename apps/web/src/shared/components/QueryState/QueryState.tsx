import type { ReactNode } from 'react'
import { Button } from '../Button'
import './QueryState.css'

type QueryStateProps = {
  isPending: boolean
  error: Error | null
  /** The request worked but matched nothing. Not the same as an error. */
  isEmpty?: boolean
  /** Space we hold, so the page doesn't jump when the query finishes. */
  height?: number
  emptyMessage?: string
  onRetry?: () => void
  children: ReactNode
}

/**
 * The four states any remote read can be in, drawn the same way everywhere.
 *
 * "Empty" is kept separate from "loading" and "error" on purpose. A filter
 * that matches nothing is a normal thing the user did and can undo, not a
 * fault. Showing it as an error teaches people to ignore real errors.
 *
 * We reserve `height` up front so a chart loading doesn't push the rest of the
 * dashboard down the page.
 */
export function QueryState({
  isPending,
  error,
  isEmpty = false,
  height = 280,
  emptyMessage = 'No traffic matches these filters.',
  onRetry,
  children,
}: QueryStateProps) {
  if (isPending) {
    return (
      <div
        className="query-state query-state--loading"
        style={{ height }}
        role="status"
        aria-live="polite"
        aria-label="Loading data"
      >
        <span className="query-state__shimmer" />
      </div>
    )
  }

  if (error) {
    return (
      <div
        className="query-state query-state--error"
        style={{ height }}
        role="alert"
      >
        <p className="query-state__title">Could not load this data</p>
        <p className="query-state__detail">{error.message}</p>
        {onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </div>
    )
  }

  if (isEmpty) {
    return (
      <div className="query-state query-state--empty" style={{ height }}>
        <p className="query-state__detail">{emptyMessage}</p>
      </div>
    )
  }

  return <>{children}</>
}
