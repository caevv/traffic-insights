import type { TrafficFilter } from './traffic.types.ts'

export type SqlFragment = {
  /** `WHERE ...`, or the empty string when nothing is filtered. */
  clause: string
  values: unknown[]
  /** Highest placeholder index used so far, so callers can continue numbering. */
  nextIndex: number
}

/**
 * Build the WHERE clause that every traffic query shares.
 *
 * The only thing we ever put into the SQL string is a placeholder number
 * ($1, $2, ...) taken from values.length. Never a caller's value. Values go in
 * the parameter array instead, so this is safe from injection and still
 * handles any number of optional filters.
 *
 * Country and vehicle type filters use a sub-select against the dimension
 * tables instead of a join in the outer query. That keeps the scan on
 * traffic_records using the indexed country_id / vehicle_type_id columns, so
 * the covering indexes can still do an index-only scan. The dimension tables
 * are 16 and 6 rows, so the sub-select costs nothing.
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
    // `< to`, not `<=`. BETWEEN is the classic way to count the boundary
    // hour twice when you compare two windows next to each other.
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
 * Mean speed, weighted by volume.
 *
 * A plain AVG(avg_speed_kph) would be wrong. It counts an hour with 3 bicycles
 * the same as an hour with 4,000 cars. Weighting by vehicle_count gives the
 * average speed of the vehicles, which is what people actually mean.
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
