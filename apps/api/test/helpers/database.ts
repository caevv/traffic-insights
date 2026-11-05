import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { migrate } from '../../src/db/migrator.ts'
import { registerTypeParsers } from '../../src/db/typeParsers.ts'

const { Pool } = pg

// The same parsers production uses, so tests see the types the API returns.
registerTypeParsers()

export type TestDatabase = {
  pool: pg.Pool
  name: string
  /** Connection string, for tests that need a pool with different settings. */
  url: string
  /** Drop the database and close every pool this helper opened. */
  destroy: () => Promise<void>
}

/**
 * Make a throwaway, migrated database for one test file.
 *
 * Tests run against real PostgreSQL, never a mock. A mocked pg would happily
 * confirm we called query() with a string containing "GROUP BY" and prove
 * nothing about whether the grouping, the weighted average or the timezone
 * conversion give the right numbers. That's the only thing these queries have
 * to get right.
 *
 * One database per test FILE, not per test and not one shared. Files run in
 * parallel without seeing each other's writes, and each pays for CREATE
 * DATABASE plus migrations once.
 */
export async function createTestDatabase(label: string): Promise<TestDatabase> {
  const adminUrl = process.env.DATABASE_URL
  if (!adminUrl) throw new Error('DATABASE_URL must be set to run tests')

  const suffix = randomBytes(4).toString('hex')
  const safeLabel = label.replace(/[^a-z0-9]/gi, '_').toLowerCase()
  const name = `traffic_insights_test_${safeLabel}_${suffix}`

  const admin = new Pool({ connectionString: adminUrl, max: 1 })
  try {
    // A database name can't be a bound parameter in SQL, so this is the one
    // place we build a statement by concatenation. `name` is a random hex
    // suffix plus a label scrubbed to [a-z0-9_] above. Never outside input.
    // eslint-disable-next-line no-restricted-syntax
    await admin.query(`CREATE DATABASE "${name}"`)
  } finally {
    await admin.end()
  }

  const url = new URL(adminUrl)
  url.pathname = `/${name}`
  const connectionString = url.toString()
  const pool = new Pool({ connectionString, max: 4 })

  await migrate(pool)

  return {
    pool,
    name,
    url: connectionString,
    destroy: async () => {
      await pool.end()
      const cleanup = new Pool({ connectionString: adminUrl, max: 1 })
      try {
        // Same identifier, same reasoning as CREATE DATABASE above.
        // eslint-disable-next-line no-restricted-syntax
        await cleanup.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
      } finally {
        await cleanup.end()
      }
    },
  }
}

/**
 * Insert a record using country and vehicle type CODES.
 *
 * Fixtures read like facts ("Germany, cars, 08:00, 100 vehicles") instead of
 * foreign keys, so you can check a failing test against the fixture table by
 * eye.
 */
export async function insertRecord(
  pool: pg.Pool,
  record: {
    country: string
    vehicleType: string
    recordedAt: string
    vehicleCount: number
    avgSpeedKph: number
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO traffic_records
       (country_id, vehicle_type_id, recorded_at, vehicle_count, avg_speed_kph)
     SELECT c.id, v.id, $3, $4, $5
     FROM countries c, vehicle_types v
     WHERE c.iso_code = $1 AND v.code = $2`,
    [
      record.country,
      record.vehicleType,
      record.recordedAt,
      record.vehicleCount,
      record.avgSpeedKph,
    ],
  )
}

export async function insertRecords(
  pool: pg.Pool,
  records: Parameters<typeof insertRecord>[1][],
): Promise<void> {
  for (const record of records) await insertRecord(pool, record)
}
