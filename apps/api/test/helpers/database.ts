import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { migrate } from '../../src/db/migrator.ts'

const { Pool, types } = pg

// Match the production parsers so tests observe the same types the API returns.
types.setTypeParser(types.builtins.INT8, (value) => Number.parseInt(value, 10))
types.setTypeParser(types.builtins.NUMERIC, (value) => Number.parseFloat(value))
types.setTypeParser(types.builtins.DATE, (value) => value)

export type TestDatabase = {
  pool: pg.Pool
  name: string
  /** Drop the database and close every pool this helper opened. */
  destroy: () => Promise<void>
}

/**
 * Create a throwaway, fully migrated database for one test file.
 *
 * Tests run against real PostgreSQL, never a mock. A mocked `pg` would happily
 * confirm that we called `query()` with a string containing "GROUP BY" while
 * proving exactly nothing about whether the grouping, the weighted average or
 * the timezone conversion produce the right numbers — which is the only thing
 * these queries need to be right about.
 *
 * A database per test FILE (rather than per test, or one shared) is the sweet
 * spot: files run in parallel without seeing each other's writes, and each
 * pays the ~200ms of CREATE DATABASE plus migrations only once.
 */
export async function createTestDatabase(label: string): Promise<TestDatabase> {
  const adminUrl = process.env.DATABASE_URL
  if (!adminUrl) throw new Error('DATABASE_URL must be set to run tests')

  const suffix = randomBytes(4).toString('hex')
  const safeLabel = label.replace(/[^a-z0-9]/gi, '_').toLowerCase()
  const name = `derq_test_${safeLabel}_${suffix}`

  const admin = new Pool({ connectionString: adminUrl, max: 1 })
  try {
    // A database IDENTIFIER cannot be a bound parameter in SQL, so this is
    // the one place in the repository that builds a statement by
    // concatenation. `name` comes from a random hex suffix plus a label
    // scrubbed to [a-z0-9_] above — never from external input.
    // eslint-disable-next-line no-restricted-syntax
    await admin.query(`CREATE DATABASE "${name}"`)
  } finally {
    await admin.end()
  }

  const url = new URL(adminUrl)
  url.pathname = `/${name}`
  const pool = new Pool({ connectionString: url.toString(), max: 4 })

  await migrate(pool)

  return {
    pool,
    name,
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
 * Insert a traffic record by country and vehicle type CODE.
 *
 * Fixtures read as domain facts ("Germany, cars, 08:00, 100 vehicles") rather
 * than as foreign keys, so a failing assertion can be checked against the
 * fixture table by eye.
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
