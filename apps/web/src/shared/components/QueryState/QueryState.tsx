import type { ReactNode } from 'react'
import { Button } from '../Button'
import './QueryState.css'

type QueryStateProps = {
  isPending: boolean
  error: Error | null
  /** The request succeeded but matched nothing — a distinct state from both. */
  isEmpty?: boolean
  /** Reserved height, so resolving a query does not shift the page. */
  height?: number
  emptyMessage?: string
  onRetry?: () => void
  children: ReactNode
}

/**
 * The four states every remote read can be in, rendered one way everywhere.
 *
 * "Empty" is deliberately separate from "loading" and "error": a filter that
 * matches no data is a normal outcome the reader caused and can undo, not a
 * fault. Collapsing it into an error teaches people to distrust real errors.
 *
 * `height` is reserved up front so a chart resolving does not shove the rest
 * of the dashboard down the page.
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
