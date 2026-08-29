import { type Db, query } from '../../db/pool.ts'
import { ISO_UTC } from '../traffic/traffic.sql.ts'

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
  /** The range of data we actually have, so the UI can size its pickers. */
  range: DataRange
}

/**
 * The dimension tables plus the date range of the data, in one round trip.
 *
 * The frontend needs all three before it can draw a single filter, so sending
 * them together saves three requests before the first paint. MIN and MAX on an
 * indexed column are index scans, not table scans.
 *
 * Each object is built with `json_build_object` rather than `row_to_json`, so
 * the query returns exactly the response shape. With `row_to_json` the vehicle
 * rows dragged `sort_order` along and had to be re-mapped in JS afterwards to
 * strip it, which also made it look like `countries` needed the same treatment.
 * It never did: countries has no sort column, so that map was copying 16
 * objects into 16 identical objects.
 */
export async function getReference(db: Db): Promise<Reference> {
  const sql = `
    SELECT
      (
        SELECT COALESCE(
          json_agg(
            json_build_object('code', iso_code, 'name', name, 'region', region)
            ORDER BY name
          ),
          '[]'::json
        )
        FROM countries
      ) AS countries,
      (
        SELECT COALESCE(
          json_agg(
            json_build_object('code', code, 'label', label)
            ORDER BY sort_order
          ),
          '[]'::json
        )
        FROM vehicle_types
      ) AS "vehicleTypes",
      (
        SELECT json_build_object(
          'from', to_char(MIN(recorded_at) AT TIME ZONE 'UTC', ${ISO_UTC}),
          'to',   to_char(MAX(recorded_at) AT TIME ZONE 'UTC', ${ISO_UTC})
        )
        FROM traffic_records
      ) AS range
  `

  const rows = await query<Reference>(db, sql)

  return (
    rows[0] ?? {
      countries: [],
      vehicleTypes: [],
      range: { from: null, to: null },
    }
  )
}
