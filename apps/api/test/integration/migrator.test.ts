import pg from 'pg'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrate } from '../../src/db/migrator.ts'
import {
  createTestDatabase,
  insertRecord,
  type TestDatabase,
} from '../helpers/database.ts'
import { seedFixtures } from '../helpers/fixtures.ts'
import { isEmpty, seed } from '../../src/db/seed.ts'

describe('migrator', () => {
  let db: TestDatabase

  beforeAll(async () => {
    // createTestDatabase already migrated this one. That's the happy path,
    // and the tests below build on it.
    db = await createTestDatabase('migrator')
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('applies nothing on a second run', async () => {
    const result = await migrate(db.pool)

    expect(result.applied).toEqual([])
    expect(result.alreadyApplied.length).toBeGreaterThan(0)
  })

  it('records each applied migration with a checksum', async () => {
    const { rows } = await db.pool.query<{ version: string; checksum: string }>(
      'SELECT version, checksum FROM schema_migrations ORDER BY version',
    )

    expect(rows.map((row) => row.version)).toEqual([
      '001_initial_schema',
      '002_reference_data',
    ])
    expect(rows[0]!.checksum).toHaveLength(64) // sha256, hex
  })

  it('refuses to run when an applied migration has been edited', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'derq-migrations-'))
    // Same version as one already applied, but different content.
    await writeFile(
      join(directory, '001_initial_schema.sql'),
      'SELECT 1; -- tampered',
    )

    await expect(migrate(db.pool, { dir: directory })).rejects.toThrow(
      /was modified after it was applied/,
    )
  })

  it('enforces the natural key created by the schema', async () => {
    await seedFixtures(db.pool)

    // A duplicate (country, vehicle type, hour) has to be impossible in the
    // DATABASE, not just discouraged in app code.
    await expect(
      insertRecord(db.pool, {
        country: 'DE',
        vehicleType: 'car',
        recordedAt: '2024-01-15T08:00:00Z',
        vehicleCount: 1,
        avgSpeedKph: 10,
      }),
    ).rejects.toMatchObject({ code: '23505' })
  })

  it('rejects a timestamp that is not on the hour', async () => {
    await expect(
      // CHECK violation. The data is hourly, so 08:30 is not a valid instant.
      insertRecord(db.pool, {
        country: 'DE',
        vehicleType: 'car',
        recordedAt: '2024-05-01T08:30:00Z',
        vehicleCount: 1,
        avgSpeedKph: 10,
      }),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('rejects an implausible speed', async () => {
    await expect(
      insertRecord(db.pool, {
        country: 'DE',
        vehicleType: 'car',
        recordedAt: '2024-05-02T08:00:00Z',
        vehicleCount: 1,
        avgSpeedKph: 999,
      }),
    ).rejects.toMatchObject({ code: '23514' })
  })
})

const SEED_DAYS = 7

describe('seed', () => {
  let db: TestDatabase

  beforeAll(async () => {
    db = await createTestDatabase('seed')
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('reports an untouched fact table as empty', async () => {
    expect(await isEmpty(db.pool)).toBe(true)
  })

  it('generates a full grid of country x vehicle type x hour', async () => {
    // Seven days, not two. Each row gets a random noise factor between 0.88
    // and 1.12, so a short window leaves few samples per hour bucket and the
    // two shape assertions below get flaky. A week is still ~16k rows and
    // under a second, and it gives the noise enough rows to average out.
    const { inserted } = await seed(db.pool, { days: SEED_DAYS })

    // 16 countries x 6 vehicle types x (7 x 24 + 1) hours. The series
    // includes both ends.
    const expectedRows = 16 * 6 * (SEED_DAYS * 24 + 1)
    expect(inserted).toBe(expectedRows)
    expect(await isEmpty(db.pool)).toBe(false)

    // The seed reports only what it inserted, so check the stored total here.
    const { rows } = await db.pool.query<{ total: number }>(
      'SELECT count(*)::bigint AS total FROM traffic_records',
    )
    expect(rows[0]!.total).toBe(expectedRows)
  })

  it('inserts nothing when the same window is seeded again', async () => {
    const { inserted } = await seed(db.pool, { days: SEED_DAYS })

    // ON CONFLICT is what makes the seed safe to run at container start-up.
    expect(inserted).toBe(0)
  })

  it('is not killed by the statement_timeout the API pool sets', async () => {
    // How this broke in CI. The pool sets statement_timeout to 5s, which is
    // right for a request and wrong for one statement that builds ~207k rows.
    // It passed locally at ~4.2s and was cancelled on a slower runner. A tiny
    // timeout here makes that failure deterministic instead of machine-speed
    // dependent.
    const strict = new pg.Pool({
      connectionString: db.url,
      max: 1,
      statement_timeout: 50,
    })

    try {
      // Proves the timeout really is in force on this pool.
      await expect(strict.query('SELECT pg_sleep(0.5)')).rejects.toMatchObject({
        code: '57014',
      })

      // 30 days is ~69k rows, which takes far longer than 50ms to generate.
      // One day would finish inside the limit and the test would pass even
      // with the fix removed, which is exactly the vacuous test to avoid.
      await expect(seed(strict, { days: 30 })).resolves.toMatchObject({
        inserted: expect.any(Number),
      })
    } finally {
      await strict.end()
    }
  })

  it('produces data that satisfies every schema constraint', async () => {
    const { rows } = await db.pool.query<{
      min_speed: number
      max_speed: number
      min_count: number
      off_hour: number
    }>(`
      SELECT MIN(avg_speed_kph) AS min_speed,
             MAX(avg_speed_kph) AS max_speed,
             MIN(vehicle_count) AS min_count,
             COUNT(*) FILTER (
               WHERE recorded_at <> date_trunc('hour', recorded_at)
             )::int AS off_hour
      FROM traffic_records
    `)

    const stats = rows[0]!
    expect(stats.min_speed).toBeGreaterThan(0)
    expect(stats.max_speed).toBeLessThanOrEqual(300)
    expect(stats.min_count).toBeGreaterThanOrEqual(0)
    expect(stats.off_hour).toBe(0)
  })

  it('models a rush hour, with peak volume well above the night low', async () => {
    const { rows } = await db.pool.query<{ hour: number; total: number }>(`
      SELECT EXTRACT(HOUR FROM t.recorded_at AT TIME ZONE c.timezone)::int AS hour,
             SUM(t.vehicle_count)::bigint AS total
      FROM traffic_records t
      JOIN countries c ON c.id = t.country_id
      GROUP BY 1
    `)

    const byHour = new Map(rows.map((row) => [row.hour, row.total]))
    const morningPeak = byHour.get(8) ?? 0
    const overnightTrough = byHour.get(2) ?? 0

    // If this fails, the generated data went flat and the charts would show
    // noise instead of a real shape.
    expect(morningPeak).toBeGreaterThan(overnightTrough * 2)
  })

  it('models congestion, with peak speed below the overnight average', async () => {
    const { rows } = await db.pool.query<{ hour: number; speed: number }>(`
      SELECT EXTRACT(HOUR FROM t.recorded_at AT TIME ZONE c.timezone)::int AS hour,
             (SUM(t.avg_speed_kph * t.vehicle_count) / SUM(t.vehicle_count))::float8 AS speed
      FROM traffic_records t
      JOIN countries c ON c.id = t.country_id
      GROUP BY 1
    `)

    const byHour = new Map(rows.map((row) => [row.hour, row.speed]))
    expect(byHour.get(8)!).toBeLessThan(byHour.get(2)!)
  })
})
