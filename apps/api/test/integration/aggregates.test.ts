import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  getTrafficByCountry,
  getTrafficByHour,
  getTrafficByVehicleType,
  getTrafficSummary,
} from '../../src/modules/traffic/traffic.repository.ts'
import { createTestDatabase, type TestDatabase } from '../helpers/database.ts'
import { EXPECTED, FIXTURE_WINDOW, seedFixtures } from '../helpers/fixtures.ts'

/**
 * The aggregate queries, against real PostgreSQL.
 *
 * These are the most important tests here. The aggregates are the product, and
 * all of them are SQL. See helpers/fixtures.ts for the four-row dataset and
 * the maths behind each expected number.
 */
describe('traffic aggregates', () => {
  let db: TestDatabase

  beforeAll(async () => {
    db = await createTestDatabase('aggregates')
    await seedFixtures(db.pool)
  })

  afterAll(async () => {
    await db.destroy()
  })

  describe('getTrafficByCountry', () => {
    it('totals vehicles per country, largest first', async () => {
      const rows = await getTrafficByCountry(db.pool, {})

      expect(rows).toHaveLength(2)
      expect(rows.map((row) => row.countryCode)).toEqual(['DE', 'FR'])
      expect(rows[0]).toMatchObject({
        countryCode: 'DE',
        countryName: 'Germany',
        region: 'Europe',
        vehicleCount: EXPECTED.germany.vehicles,
      })
      expect(rows[1]).toMatchObject({
        countryCode: 'FR',
        vehicleCount: EXPECTED.france.vehicles,
      })
    })

    it('weights mean speed by vehicle count, not by row', async () => {
      const [germany] = await getTrafficByCountry(db.pool, {
        countries: ['DE'],
      })

      // 44.0 weighted, vs 53.3 for a plain average of the three hours.
      expect(germany?.avgSpeedKph).toBe(EXPECTED.germany.weightedSpeed)
      expect(germany?.avgSpeedKph).not.toBeCloseTo(53.3, 1)
    })

    it('restricts the result to the countries asked for', async () => {
      const rows = await getTrafficByCountry(db.pool, { countries: ['FR'] })

      expect(rows).toHaveLength(1)
      expect(rows[0]?.countryCode).toBe('FR')
    })

    it('treats the time window as half-open, [from, to)', async () => {
      // `to` sits exactly on the 09:00 row, and `to` is excluded. That
      // leaves the two 08:00 rows for Germany (100 + 100).
      const rows = await getTrafficByCountry(db.pool, {
        countries: ['DE'],
        from: new Date('2024-01-15T08:00:00Z'),
        to: new Date('2024-01-15T09:00:00Z'),
      })

      expect(rows[0]?.vehicleCount).toBe(200)
    })

    it('returns no rows when the window matches nothing', async () => {
      const rows = await getTrafficByCountry(db.pool, {
        from: new Date('2030-01-01T00:00:00Z'),
      })

      expect(rows).toEqual([])
    })
  })

  describe('getTrafficByVehicleType', () => {
    it('totals vehicles per type with shares that sum to 1', async () => {
      const rows = await getTrafficByVehicleType(db.pool, {})

      expect(rows.map((row) => row.vehicleType)).toEqual(['car', 'truck'])
      expect(rows[0]).toMatchObject({
        vehicleType: 'car',
        label: 'Car',
        vehicleCount: EXPECTED.cars.vehicles,
      })
      expect(rows[0]?.share).toBeCloseTo(EXPECTED.cars.share, 5)
      expect(rows[1]?.share).toBeCloseTo(EXPECTED.trucks.share, 5)

      const totalShare = rows.reduce((sum, row) => sum + row.share, 0)
      expect(totalShare).toBeCloseTo(1, 5)
    })

    it('recomputes shares against the FILTERED total, not the global one', async () => {
      // Germany only: cars 400 of 500, trucks 100 of 500.
      const rows = await getTrafficByVehicleType(db.pool, {
        countries: ['DE'],
      })

      expect(rows.find((row) => row.vehicleType === 'car')?.share).toBeCloseTo(
        0.8,
        5,
      )
      expect(
        rows.find((row) => row.vehicleType === 'truck')?.share,
      ).toBeCloseTo(0.2, 5)
    })
  })

  describe('getTrafficByHour', () => {
    it("buckets by each country's LOCAL hour, not by UTC", async () => {
      const rows = await getTrafficByHour(db.pool, {})

      // Berlin and Paris are UTC+1 in January, so 08:00Z is local hour 9.
      // Doing it in UTC would give hours 8 and 9 instead.
      expect(
        rows.map(({ hour, vehicleCount }) => ({ hour, vehicleCount })),
      ).toEqual([...EXPECTED.localHours])
    })

    it('keeps hours ordered 0..23 so the axis needs no client-side sort', async () => {
      const rows = await getTrafficByHour(db.pool, {})
      const hours = rows.map((row) => row.hour)

      expect(hours).toEqual([...hours].sort((a, b) => a - b))
    })
  })

  describe('getTrafficSummary', () => {
    it('reports totals and the extent of the matched data', async () => {
      const summary = await getTrafficSummary(db.pool, FIXTURE_WINDOW_FILTER)

      expect(summary).toMatchObject({
        totalVehicles: EXPECTED.totalVehicles,
        recordCount: 4,
        countryCount: 2,
        firstRecordedAt: '2024-01-15T08:00:00Z',
        lastRecordedAt: '2024-01-16T08:00:00Z',
      })
    })

    it('returns zeroes rather than nulls when nothing matches', async () => {
      const summary = await getTrafficSummary(db.pool, {
        from: new Date('2030-01-01T00:00:00Z'),
      })

      expect(summary).toMatchObject({
        totalVehicles: 0,
        avgSpeedKph: 0,
        recordCount: 0,
        countryCount: 0,
        firstRecordedAt: null,
        lastRecordedAt: null,
      })
    })
  })
})

const FIXTURE_WINDOW_FILTER = {
  from: new Date(FIXTURE_WINDOW.from),
  to: new Date(FIXTURE_WINDOW.to),
}
