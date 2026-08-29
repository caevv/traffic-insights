import { type Db, query } from '../../db/pool.ts'

export type Country = {
  code: string
  name: string
  region: string
}

export type VehicleType = {
  code: string
  label: string
}

export type DataRange = {
  from: string | null
  to: string | null
}

export type Reference = {
  countries: Country[]
  vehicleTypes: VehicleType[]
  /** Bounds of the data that actually exists, so the UI can size its pickers. */
  range: DataRange
}

/**
 * The dimension tables plus the extent of the fact table, in one round trip.
 *
 * The frontend needs all three before it can render a single filter control, so
 * shipping them together removes three sequential requests from the critical
 * path of the first paint. `min`/`max` on an indexed column are index scans,
 * not table scans.
 */
export async function getReference(db: Db): Promise<Reference> {
  const sql = `
    SELECT
      (
        SELECT COALESCE(json_agg(row_to_json(c) ORDER BY c.name), '[]'::json)
        FROM (
          SELECT iso_code AS code, name, region FROM countries
        ) c
      ) AS countries,
      (
        SELECT COALESCE(json_agg(row_to_json(v) ORDER BY v.sort_order), '[]'::json)
        FROM (
          SELECT code, label, sort_order FROM vehicle_types
        ) v
      ) AS "vehicleTypes",
      (
        SELECT json_build_object(
          'from', to_char(MIN(recorded_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'to',   to_char(MAX(recorded_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )
        FROM traffic_records
      ) AS range
  `

  const rows = await query<{
    countries: (Country & { sort_order?: number })[]
    vehicleTypes: (VehicleType & { sort_order?: number })[]
    range: DataRange
  }>(db, sql)

  const row = rows[0]
  if (!row) {
    return { countries: [], vehicleTypes: [], range: { from: null, to: null } }
  }

  return {
    countries: row.countries.map(({ code, name, region }) => ({
      code,
      name,
      region,
    })),
    vehicleTypes: row.vehicleTypes.map(({ code, label }) => ({ code, label })),
    range: row.range,
  }
}
