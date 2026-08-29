/**
 * Get a database ready to serve: migrate, then seed it if it's empty.
 *
 * This is the container start-up step. It's here so `docker compose up` on a
 * fresh clone gives you a dashboard with data, with no manual psql step in the
 * README. That step is the usual reason a first run fails.
 *
 * We only seed when the table is empty, so restarting the stack never wipes
 * data someone typed into the UI.
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

  console.log(`Empty database. Seeding ${env.SEED_DAYS} day(s) of traffic...`)
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
