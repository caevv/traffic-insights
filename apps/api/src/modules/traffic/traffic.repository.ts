import { type Db, query } from '../../db/pool.ts'
import {
  ConflictError,
  isPgError,
  NotFoundError,
  PG_UNIQUE_VIOLATION,
  UnprocessableError,
} from '../../lib/errors.ts'
import { buildTrafficFilter, WEIGHTED_SPEED } from './traffic.sql.ts'
import type {
  CountryTraffic,
  HourlyTraffic,
  Page,
  TrafficFilter,
  TrafficRecord,
  TrafficRecordInput,
  TrafficRecordPatch,
  TrafficSummary,
  VehicleTypeTraffic,
} from './traffic.types.ts'

/**
 * Each query below is one round trip and returns at most as many rows as the
 * thing it groups by: 16 countries, 6 vehicle types, 24 hours. Nothing pulls
 * the fact table into Node to add it up there. That would push hundreds of
 * thousands of rows over the socket for a number Postgres can work out during
 * the scan it's already doing.
 *
 * Timestamps use to_char(... AT TIME ZONE 'UTC', ...) so Postgres writes the
 * ISO string itself and the JSON is the same whatever TZ the container has.
 */

const ISO_UTC = `'YYYY-MM-DD"T"HH24:MI:SS"Z"'`

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

/** Country-wise totals, largest first. Drives the country bar chart. */
export async function getTrafficByCountry(
  db: Db,
  filter: TrafficFilter,
): Promise<CountryTraffic[]> {
  const { clause, values } = buildTrafficFilter(filter)

  // Group on the indexed country_id first, then join the 16-row table onto
  // the result. Joining before the GROUP BY means a table read per fact row,
  // and we lose the index-only scan.
  const sql = `
    WITH aggregated AS (
      SELECT
        t.country_id,
        SUM(t.vehicle_count)::bigint AS vehicle_count,
        ${WEIGHTED_SPEED} AS avg_speed_kph
      FROM traffic_records t
      ${clause}
      GROUP BY t.country_id
    )
    SELECT
      c.iso_code            AS "countryCode",
      c.name                AS "countryName",
      c.region              AS "region",
      a.vehicle_count       AS "vehicleCount",
      a.avg_speed_kph       AS "avgSpeedKph"
    FROM aggregated a
    JOIN countries c ON c.id = a.country_id
    ORDER BY a.vehicle_count DESC, c.name ASC
  `

  return query<CountryTraffic>(db, sql, values)
}

/**
 * Vehicle types with each one's share of the filtered total.
 *
 * The share comes from a window function over the grouped rows. SUM(...) OVER ()
 * adds up the six group totals, so the divisor comes from the same pass. Doing
 * it in Node would mean a second query, or a total that doesn't match the parts.
 */
export async function getTrafficByVehicleType(
  db: Db,
  filter: TrafficFilter,
): Promise<VehicleTypeTraffic[]> {
  const { clause, values } = buildTrafficFilter(filter)

  const sql = `
    WITH aggregated AS (
      SELECT
        t.vehicle_type_id,
        SUM(t.vehicle_count)::bigint AS vehicle_count,
        ${WEIGHTED_SPEED} AS avg_speed_kph
      FROM traffic_records t
      ${clause}
      GROUP BY t.vehicle_type_id
    )
    SELECT
      v.code          AS "vehicleType",
      v.label         AS "label",
      a.vehicle_count AS "vehicleCount",
      COALESCE(
        ROUND(
          a.vehicle_count::numeric
            / NULLIF(SUM(a.vehicle_count) OVER (), 0),
          6
        ),
        0
      )               AS "share",
      a.avg_speed_kph AS "avgSpeedKph"
    FROM aggregated a
    JOIN vehicle_types v ON v.id = a.vehicle_type_id
    ORDER BY a.vehicle_count DESC, v.sort_order ASC
  `

  return query<VehicleTypeTraffic>(db, sql, values)
}

/**
 * Volume and speed by hour of day, in each country's own local time.
 *
 * AT TIME ZONE c.timezone looks the zone up in Postgres' own tz database, DST
 * and all, so 08:00 in Berlin and 08:00 in Tokyo end up in the same bucket.
 * Bucketing by UTC hour instead would smear all 16 rush hours across the day
 * and flatten the chart. Correct, but useless.
 *
 * This is the one query that can't use the covering indexes. It needs
 * countries.timezone, so it joins before grouping. See docs/scalability.md.
 * It's the first one to pre-aggregate.
 */
export async function getTrafficByHour(
  db: Db,
  filter: TrafficFilter,
): Promise<HourlyTraffic[]> {
  const { clause, values } = buildTrafficFilter(filter)

  const sql = `
    SELECT
      EXTRACT(HOUR FROM t.recorded_at AT TIME ZONE c.timezone)::int AS "hour",
      SUM(t.vehicle_count)::bigint                                  AS "vehicleCount",
      ${WEIGHTED_SPEED}                                             AS "avgSpeedKph"
    FROM traffic_records t
    JOIN countries c ON c.id = t.country_id
    ${clause}
    GROUP BY 1
    ORDER BY 1
  `

  return query<HourlyTraffic>(db, sql, values)
}

/** Headline figures for the dashboard's KPI strip. */
export async function getTrafficSummary(
  db: Db,
  filter: TrafficFilter,
): Promise<TrafficSummary> {
  const { clause, values } = buildTrafficFilter(filter)

  const sql = `
    SELECT
      COALESCE(SUM(t.vehicle_count), 0)::bigint AS "totalVehicles",
      ${WEIGHTED_SPEED}                          AS "avgSpeedKph",
      COUNT(*)::bigint                           AS "recordCount",
      COUNT(DISTINCT t.country_id)::bigint       AS "countryCount",
      to_char(MIN(t.recorded_at) AT TIME ZONE 'UTC', ${ISO_UTC}) AS "firstRecordedAt",
      to_char(MAX(t.recorded_at) AT TIME ZONE 'UTC', ${ISO_UTC}) AS "lastRecordedAt"
    FROM traffic_records t
    ${clause}
  `

  const rows = await query<TrafficSummary>(db, sql, values)
  return (
    rows[0] ?? {
      totalVehicles: 0,
      avgSpeedKph: 0,
      recordCount: 0,
      countryCount: 0,
      firstRecordedAt: null,
      lastRecordedAt: null,
    }
  )
}

// ---------------------------------------------------------------------------
// Records. The write path.
// ---------------------------------------------------------------------------

const RECORD_PROJECTION = `
  t.id                                                       AS "id",
  c.iso_code                                                 AS "countryCode",
  c.name                                                     AS "countryName",
  v.code                                                     AS "vehicleType",
  v.label                                                    AS "vehicleTypeLabel",
  to_char(t.recorded_at AT TIME ZONE 'UTC', ${ISO_UTC})      AS "recordedAt",
  t.vehicle_count                                            AS "vehicleCount",
  t.avg_speed_kph                                            AS "avgSpeedKph",
  to_char(t.updated_at   AT TIME ZONE 'UTC', ${ISO_UTC})     AS "updatedAt"
`

const RECORD_JOINS = `
  FROM traffic_records t
  JOIN countries c     ON c.id = t.country_id
  JOIN vehicle_types v ON v.id = t.vehicle_type_id
`

export async function listTrafficRecords(
  db: Db,
  filter: TrafficFilter,
  page: { limit: number; offset: number },
): Promise<Page<TrafficRecord>> {
  const { clause, values, nextIndex } = buildTrafficFilter(filter)

  // COUNT(*) OVER () gets the full total from the same scan, so no second
  // round trip. It costs one pass over the matched rows. At much bigger
  // volumes, switch to keyset pagination (see docs/scalability.md).
  const sql = `
    SELECT ${RECORD_PROJECTION},
           COUNT(*) OVER ()::bigint AS "total"
    ${RECORD_JOINS}
    ${clause}
    ORDER BY t.recorded_at DESC, t.id DESC
    LIMIT $${nextIndex + 1} OFFSET $${nextIndex + 2}
  `

  const rows = await query<TrafficRecord & { total: number }>(db, sql, [
    ...values,
    page.limit,
    page.offset,
  ])

  return {
    items: rows.map(({ total: _total, ...record }) => record),
    total: rows[0]?.total ?? 0,
    limit: page.limit,
    offset: page.offset,
  }
}

export async function getTrafficRecord(
  db: Db,
  id: number,
): Promise<TrafficRecord> {
  const sql = `SELECT ${RECORD_PROJECTION} ${RECORD_JOINS} WHERE t.id = $1`
  const rows = await query<TrafficRecord>(db, sql, [id])

  const record = rows[0]
  if (!record) throw new NotFoundError(`Traffic record ${id} does not exist.`)
  return record
}

export async function createTrafficRecord(
  db: Db,
  input: TrafficRecordInput,
): Promise<TrafficRecord> {
  // INSERT ... SELECT from the dimension tables looks up the codes and checks
  // them in one statement. An unknown code gives zero rows, so nothing is
  // inserted and we can say which side was wrong. No separate lookup query
  // that another writer could race.
  const sql = `
    INSERT INTO traffic_records
      (country_id, vehicle_type_id, recorded_at, vehicle_count, avg_speed_kph)
    SELECT c.id, v.id, $3, $4, $5
    FROM countries c, vehicle_types v
    WHERE c.iso_code = $1 AND v.code = $2
    RETURNING id
  `

  let inserted: { id: number }[]
  try {
    inserted = await query<{ id: number }>(db, sql, [
      input.country,
      input.vehicleType,
      input.recordedAt,
      input.vehicleCount,
      input.avgSpeedKph,
    ])
  } catch (error) {
    if (isPgError(error, PG_UNIQUE_VIOLATION)) {
      throw new ConflictError(
        `A record already exists for ${input.country}/${input.vehicleType} at ` +
          `${input.recordedAt.toISOString()}. Update it instead.`,
      )
    }
    throw error
  }

  const id = inserted[0]?.id
  if (id === undefined) {
    throw new UnprocessableError('Unknown country or vehicle type.', {
      country: input.country,
      vehicleType: input.vehicleType,
    })
  }

  return getTrafficRecord(db, id)
}

export async function updateTrafficRecord(
  db: Db,
  id: number,
  patch: TrafficRecordPatch,
): Promise<TrafficRecord> {
  const assignments: string[] = []
  const values: unknown[] = []

  // Same rule as the filter builder: only the placeholder number goes into
  // the SQL text.
  const placeholder = (value: unknown): string => {
    values.push(value)
    return `$${values.length}`
  }

  if (patch.country !== undefined) {
    assignments.push(
      `country_id = (SELECT id FROM countries WHERE iso_code = ${placeholder(patch.country)})`,
    )
  }
  if (patch.vehicleType !== undefined) {
    assignments.push(
      `vehicle_type_id = (SELECT id FROM vehicle_types WHERE code = ${placeholder(patch.vehicleType)})`,
    )
  }
  if (patch.recordedAt !== undefined) {
    assignments.push(`recorded_at = ${placeholder(patch.recordedAt)}`)
  }
  if (patch.vehicleCount !== undefined) {
    assignments.push(`vehicle_count = ${placeholder(patch.vehicleCount)}`)
  }
  if (patch.avgSpeedKph !== undefined) {
    assignments.push(`avg_speed_kph = ${placeholder(patch.avgSpeedKph)}`)
  }

  if (assignments.length === 0) {
    // Nothing to change. Return the record as is, instead of running an
    // UPDATE that would bump updated_at for no reason.
    return getTrafficRecord(db, id)
  }

  const sql = `
    UPDATE traffic_records
    SET ${assignments.join(', ')}
    WHERE id = ${placeholder(id)}
    RETURNING id
  `

  let updated: { id: number }[]
  try {
    updated = await query<{ id: number }>(db, sql, values)
  } catch (error) {
    if (isPgError(error, PG_UNIQUE_VIOLATION)) {
      throw new ConflictError(
        'That change would collide with an existing record for the same ' +
          'country, vehicle type and hour.',
      )
    }
    // A bad code makes the sub-select return NULL, and the NOT NULL column
    // rejects it (23502). That's a bad value, not a server error.
    if (isPgError(error, '23502')) {
      throw new UnprocessableError('Unknown country or vehicle type.', {
        ...(patch.country !== undefined ? { country: patch.country } : {}),
        ...(patch.vehicleType !== undefined
          ? { vehicleType: patch.vehicleType }
          : {}),
      })
    }
    throw error
  }

  if (updated.length === 0) {
    throw new NotFoundError(`Traffic record ${id} does not exist.`)
  }

  return getTrafficRecord(db, id)
}

export async function deleteTrafficRecord(db: Db, id: number): Promise<void> {
  const rows = await query<{ id: number }>(
    db,
    'DELETE FROM traffic_records WHERE id = $1 RETURNING id',
    [id],
  )

  if (rows.length === 0) {
    throw new NotFoundError(`Traffic record ${id} does not exist.`)
  }
}
