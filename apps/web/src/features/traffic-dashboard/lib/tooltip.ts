/**
 * Shared unpacking for Recharts tooltips.
 *
 * All three charts wrote the same two-line guard against the payload shape.
 * It lives in its own file, not next to TooltipShell, so the component files
 * export components only, which is what keeps Vite's Fast Refresh working.
 */

/**
 * What Recharts hands a `content` component. Only the first entry matters
 * here: every chart plots one datum per point, and the second series on the
 * hourly chart shares that same datum.
 */
export type RechartsTooltipProps<T> = {
  active?: boolean
  payload?: { payload: T }[]
}

/** The datum under the cursor, or null when there's nothing to show. */
export function tooltipDatum<T>({
  active,
  payload,
}: RechartsTooltipProps<T>): T | null {
  const datum = payload?.[0]?.payload
  return active && datum ? datum : null
}
