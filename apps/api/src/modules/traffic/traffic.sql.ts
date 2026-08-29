import type { TrafficFilter } from './traffic.types.ts'

export type SqlFragment = {
  /** `WHERE ...`, or the empty string when nothing is filtered. */
  clause: string
  values: unknown[]
  /** Highest placeholder index used so far, so callers can continue numbering. */
  nextIndex: number
}

/**
 * Compose the WHERE clause shared by every traffic query.
 *
 * The only thing ever interpolated into the SQL string is a placeholder index
 * (`$1`, `$2`, ...) derived from `values.length` — never a caller-supplied
 * value. Values travel separately in the parameter array, so this stays immune
 * to injection while still supporting a variable number of optional filters.
 *
 * Country and vehicle-type filters are expressed as a semi-join against the
 * dimension tables rather than a join in the outer query. That keeps the scan
 * on `traffic_records` restricted to the indexed `country_id`/`vehicle_type_id`
 * columns, so the covering indexes can still serve the aggregate as an
 * index-only scan; the dimension tables are 16 and 6 rows, so the semi-join is
 * effectively free.
 */
export function buildTrafficFilter(
  filter: TrafficFilter,
  startIndex = 0,
): SqlFragment {
  const conditions: string[] = []
  const values: unknown[] = []

  const placeholder = (value: unknown): string => {
    values.push(value)
    return `$${startIndex + values.length}`
  }

  if (filter.from) {
    conditions.push(`t.recorded_at >= ${placeholder(filter.from)}`)
  }
  if (filter.to) {
    // Half-open: `< to`. Using BETWEEN here is the classic way to
    // double-count the boundary hour when two adjacent windows are compared.
    conditions.push(`t.recorded_at < ${placeholder(filter.to)}`)
  }
  if (filter.countries && filter.countries.length > 0) {
    conditions.push(
      `t.country_id = ANY (SELECT id FROM countries WHERE iso_code = ANY (${placeholder(
        filter.countries,
      )}))`,
    )
  }
  if (filter.vehicleTypes && filter.vehicleTypes.length > 0) {
    conditions.push(
      `t.vehicle_type_id = ANY (SELECT id FROM vehicle_types WHERE code = ANY (${placeholder(
        filter.vehicleTypes,
      )}))`,
    )
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
    nextIndex: startIndex + values.length,
  }
}

/**
 * Volume-weighted mean speed.
 *
 * `AVG(avg_speed_kph)` would be wrong: it weights an hour with 3 bicycles the
 * same as an hour with 4,000 cars. Weighting by `vehicle_count` gives the mean
 * speed *of the vehicles*, which is the number a traffic analyst means.
 */
export const WEIGHTED_SPEED = `
  CASE
    WHEN SUM(t.vehicle_count) > 0
      THEN ROUND(
        SUM(t.avg_speed_kph * t.vehicle_count) / SUM(t.vehicle_count), 1
      )
    ELSE 0
  END
`
