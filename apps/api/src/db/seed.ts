import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Db } from './pool.ts'

const SEED_SQL_PATH = join(import.meta.dirname, 'seed.sql')

export type SeedOptions = {
  /** Days of hourly history to make, ending at the current hour. */
  days: number
  /** Wipe traffic_records first. Never touches the dimension tables. */
  reset?: boolean
}

export type SeedResult = {
  inserted: number
}

/**
 * Fill traffic_records.
 *
 * Safe to run again. The statement upserts on the natural key, so a second run
 * just tops up the hours that have passed since the first. That's what makes
 * it usable as a container start-up step and not a one-off chore.
 */
export async function seed(db: Db, options: SeedOptions): Promise<SeedResult> {
  const sql = await readFile(SEED_SQL_PATH, 'utf8')
  const client = await db.connect()

  try {
    await client.query('BEGIN')

    if (options.reset) {
      await client.query('TRUNCATE traffic_records RESTART IDENTITY')
    }

    const result = await client.query(sql, [options.days])

    await client.query('COMMIT')

    // Only the insert count. A `SELECT count(*)` here would scan all ~207k
    // rows on every bootstrap to produce a number nothing but a log line reads.
    return { inserted: result.rowCount ?? 0 }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/**
 * True when the fact table has no rows. The container start-up step uses this
 * to decide if a fresh volume needs seeding, so `docker compose up` gives you
 * a dashboard with data in it and no extra steps.
 */
export async function isEmpty(db: Db): Promise<boolean> {
  const { rows } = await db.query<{ present: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM traffic_records) AS present',
  )
  return rows[0]?.present !== true
}
