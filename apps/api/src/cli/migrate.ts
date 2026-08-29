/**
 * Run any pending migrations, then exit.
 *
 * Works on its own (`npm run db:migrate`) or as a container start-up step.
 * Either way the exit code is what matters: 0 means the schema is up to date,
 * anything else means don't start serving.
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
