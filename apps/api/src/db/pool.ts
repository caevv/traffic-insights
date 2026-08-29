import pg from 'pg'
import { env } from '../config/env.ts'
import { registerTypeParsers } from './typeParsers.ts'

const { Pool } = pg

registerTypeParsers()

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
