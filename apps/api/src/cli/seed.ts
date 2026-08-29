/**
 * Populate the fact table with generated traffic data, then exit.
 *
 *   npm run db:seed                 top up missing hours (idempotent)
 *   npm run db:seed -- --reset      wipe traffic_records first
 *   npm run db:seed -- --days=30    override SEED_DAYS for this run
 */
import { env } from '../config/env.ts'
import { pool } from '../db/pool.ts'
import { seed } from '../db/seed.ts'

function parseDays(argv: readonly string[], fallback: number): number {
  const flag = argv.find((arg) => arg.startsWith('--days='))
  if (!flag) return fallback

  const value = Number.parseInt(flag.slice('--days='.length), 10)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--days must be a positive integer, received "${flag}"`)
  }
  return value
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const days = parseDays(argv, env.SEED_DAYS)
  const reset = argv.includes('--reset')

  console.log(
    `Seeding ${days} day(s) of hourly traffic${reset ? ' (after reset)' : ''}...`,
  )

  const startedAt = performance.now()
  const { inserted } = await seed(pool, { days, reset })
  const elapsed = Math.round(performance.now() - startedAt)

  console.log(
    `Inserted ${inserted.toLocaleString('en-US')} row(s) in ${elapsed}ms.`,
  )
}

try {
  await main()
} catch (error) {
  console.error('Seed failed:', error)
  process.exitCode = 1
} finally {
  await pool.end()
}
