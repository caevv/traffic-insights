import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Db } from './pool.ts'

const SEED_SQL_PATH = join(import.meta.dirname, 'seed.sql')

export type SeedOptions = {
  /** Days of hourly history to generate, ending at the current hour. */
  days: number
  /** Wipe `traffic_records` first. Dimension tables are never touched. */
  reset?: boolean
}

export type SeedResult = {
  inserted: number
  total: number
}

/**
 * Populate `traffic_records`.
 *
 * Safe to run repeatedly: the statement is an upsert against the natural key,
 * so a second run tops up whatever hours have elapsed since the first instead
 * of duplicating anything. That is what makes it usable as a container start-up
 * step rather than a one-shot developer chore.
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
    const { rows } = await client.query<{ total: number }>(
      'SELECT count(*)::bigint AS total FROM traffic_records',
    )

    await client.query('COMMIT')

    return { inserted: result.rowCount ?? 0, total: rows[0]?.total ?? 0 }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/**
 * True when the fact table has no rows. Used by the container entrypoint to
 * decide whether a fresh volume needs seeding, so `docker compose up` yields a
 * populated dashboard without a manual step.
 */
export async function isEmpty(db: Db): Promise<boolean> {
  const { rows } = await db.query<{ present: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM traffic_records) AS present',
  )
  return rows[0]?.present !== true
}
