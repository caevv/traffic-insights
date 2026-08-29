/**
 * Apply pending database migrations, then exit.
 *
 * Run standalone (`npm run db:migrate`) or as the API container's start-up
 * step. Either way the exit code is the contract: 0 means the schema is at
 * head, non-zero means do not start serving traffic.
 */
import { migrate } from '../db/migrator.ts'
import { pool } from '../db/pool.ts'

async function main(): Promise<void> {
  const { applied, alreadyApplied } = await migrate(pool, {
    logger: (message) => console.log(`  ${message}`),
  })

  if (applied.length === 0) {
    console.log(
      `Database is up to date (${alreadyApplied.length} migration(s) already applied).`,
    )
  } else {
    console.log(
      `Applied ${applied.length} migration(s); ${alreadyApplied.length} were already at head.`,
    )
  }
}

try {
  await main()
} catch (error) {
  console.error('Migration failed:', error)
  process.exitCode = 1
} finally {
  await pool.end()
}
