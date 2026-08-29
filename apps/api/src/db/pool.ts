import pg from 'pg'
import { env } from '../config/env.ts'

const { Pool, types } = pg

/**
 * node-postgres returns `bigint` (OID 20) and `numeric` (OID 1700) as strings
 * because they can exceed IEEE-754 precision. Our aggregates are bounded well
 * inside `Number.MAX_SAFE_INTEGER` (a SUM of daily vehicle counts), so we parse
 * them into numbers here rather than sprinkling `Number(...)` across the
 * repository and risking one place that forgets.
 */
types.setTypeParser(types.builtins.INT8, (value) => Number.parseInt(value, 10))
types.setTypeParser(types.builtins.NUMERIC, (value) => Number.parseFloat(value))

/**
 * `DATE` (OID 1082) is parsed to a JS Date by default, which silently shifts
 * the day when the process runs in a non-UTC timezone. A calendar date has no
 * timezone; keep it as the `YYYY-MM-DD` string Postgres sent.
 */
types.setTypeParser(types.builtins.DATE, (value) => value)

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.PG_POOL_MAX,
  // Bound how long a single query may pin a pool connection. Without this one
  // slow query can starve every other request during a traffic spike.
  statement_timeout: env.PG_STATEMENT_TIMEOUT_MS,
  // Recycle idle connections so a restarted/failed-over Postgres does not leave
  // the pool holding dead sockets.
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

export type Db = pg.Pool

/** Convenience wrapper: run a parameterised query and get typed rows back. */
export async function query<T extends pg.QueryResultRow>(
  db: Db,
  text: string,
  values: readonly unknown[] = [],
): Promise<T[]> {
  const result = await db.query<T>(text, values as unknown[])
  return result.rows
}
