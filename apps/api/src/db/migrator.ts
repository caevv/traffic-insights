import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Db } from './pool.ts'

/**
 * A deliberately small forward-only migration runner.
 *
 * Three properties matter more than feature count here:
 *
 *  1. **Safe under concurrency.** Every API replica runs migrations at boot. A
 *     Postgres session-level advisory lock serialises them, so N replicas
 *     starting together apply each migration exactly once instead of racing
 *     and deadlocking on `CREATE TABLE`.
 *  2. **Atomic.** Each file runs inside a transaction together with the insert
 *     into `schema_migrations`. A failure halfway leaves no partial schema and
 *     no bookkeeping row claiming success.
 *  3. **Tamper-evident.** Applied files are checksummed. Editing a migration
 *     that already ran is a hard error, because the database you are looking at
 *     no longer matches the file you are reading.
 */

/** Arbitrary but fixed: namespaces our lock inside Postgres' shared lock space. */
const ADVISORY_LOCK_KEY = 4_811_552_301

const MIGRATIONS_DIR = join(import.meta.dirname, 'migrations')

export type AppliedMigration = {
  version: string
  checksum: string
}

export type MigrationResult = {
  applied: string[]
  alreadyApplied: string[]
}

const CREATE_BOOKKEEPING_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version     TEXT        PRIMARY KEY,
    checksum    TEXT        NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`

function checksum(contents: string): string {
  return createHash('sha256').update(contents).digest('hex')
}

async function readMigrationFiles(
  dir: string,
): Promise<{ version: string; sql: string }[]> {
  const entries = await readdir(dir)
  const files = entries.filter((name) => name.endsWith('.sql')).sort()

  return Promise.all(
    files.map(async (name) => ({
      version: name.replace(/\.sql$/, ''),
      sql: await readFile(join(dir, name), 'utf8'),
    })),
  )
}

export async function migrate(
  db: Db,
  options: { dir?: string; logger?: (message: string) => void } = {},
): Promise<MigrationResult> {
  const dir = options.dir ?? MIGRATIONS_DIR
  const log = options.logger ?? (() => {})

  const files = await readMigrationFiles(dir)
  const applied: string[] = []
  const alreadyApplied: string[] = []

  // A dedicated connection: the advisory lock is session-scoped, so it must be
  // taken and released on the same physical connection.
  const client = await db.connect()

  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY])
    await client.query(CREATE_BOOKKEEPING_TABLE)

    const { rows } = await client.query<AppliedMigration>(
      'SELECT version, checksum FROM schema_migrations',
    )
    const previous = new Map(rows.map((row) => [row.version, row.checksum]))

    for (const file of files) {
      const digest = checksum(file.sql)
      const seen = previous.get(file.version)

      if (seen !== undefined) {
        if (seen !== digest) {
          throw new Error(
            `Migration ${file.version} was modified after it was applied ` +
              `(recorded ${seen.slice(0, 12)}, file ${digest.slice(0, 12)}). ` +
              `Migrations are immutable — add a new one instead.`,
          )
        }
        alreadyApplied.push(file.version)
        continue
      }

      await client.query('BEGIN')
      try {
        await client.query(file.sql)
        await client.query(
          'INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)',
          [file.version, digest],
        )
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw new Error(`Migration ${file.version} failed: ${String(error)}`, {
          cause: error,
        })
      }

      applied.push(file.version)
      log(`applied ${file.version}`)
    }

    return { applied, alreadyApplied }
  } finally {
    await client
      .query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY])
      .catch(() => {
        /* The connection is being discarded anyway; the lock dies with it. */
      })
    client.release()
  }
}
