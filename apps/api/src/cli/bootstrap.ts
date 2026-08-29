/**
 * Prepare a database for serving: migrate to head, then seed if it is empty.
 *
 * This is the container start-up step. It exists so that `docker compose up` on
 * a fresh clone yields a populated dashboard with no manual `psql` anywhere in
 * the setup instructions — the single most common way a reviewer's first run of
 * a project fails.
 *
 * Seeding is conditional on the fact table being empty rather than
 * unconditional, so restarting the stack never overwrites data someone entered
 * through the UI.
 */
import { env } from '../config/env.ts'
import { migrate } from '../db/migrator.ts'
import { pool } from '../db/pool.ts'
import { isEmpty, seed } from '../db/seed.ts'

async function main(): Promise<void> {
  const { applied, alreadyApplied } = await migrate(pool, {
    logger: (message) => console.log(`  ${message}`),
  })
  console.log(
    `Schema at head: ${applied.length} applied, ${alreadyApplied.length} already present.`,
  )

  if (!(await isEmpty(pool))) {
    console.log('traffic_records already populated; skipping seed.')
    return
  }

  console.log(`Empty database — seeding ${env.SEED_DAYS} day(s) of traffic...`)
  const startedAt = performance.now()
  const { total } = await seed(pool, { days: env.SEED_DAYS })
  console.log(
    `Seeded ${total.toLocaleString('en-US')} row(s) in ${Math.round(
      performance.now() - startedAt,
    )}ms.`,
  )
}

try {
  await main()
} catch (error) {
  console.error('Bootstrap failed:', error)
  process.exitCode = 1
} finally {
  await pool.end()
}
