import pg from 'pg'
import { env } from '../config/env.ts'

const { Pool, types } = pg

// pg returns bigint and numeric as strings, because they can be bigger than a
// JS number can hold. Our sums are daily vehicle counts, nowhere near that
// limit, so we parse them here. Otherwise SUM() comes back as "48213" and the
// charts get a string where they want a number.
types.setTypeParser(types.builtins.INT8, (value) => Number.parseInt(value, 10))
types.setTypeParser(types.builtins.NUMERIC, (value) => Number.parseFloat(value))

// DATE would be parsed into a JS Date, which shifts the day if the process
// runs outside UTC. A calendar date has no timezone, so keep the string.
types.setTypeParser(types.builtins.DATE, (value) => value)

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.PG_POOL_MAX,
  // Stops one slow query from holding a connection forever and starving
  // everything else during a spike.
  statement_timeout: env.PG_STATEMENT_TIMEOUT_MS,
  // Drop idle connections so we don't keep dead sockets after Postgres
  // restarts or fails over.
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

export type Db = pg.Pool

/** Run a parameterised query and get typed rows back. */
export async function query<T extends pg.QueryResultRow>(
  db: Db,
  text: string,
  values: readonly unknown[] = [],
): Promise<T[]> {
  const result = await db.query<T>(text, values as unknown[])
  return result.rows
}
