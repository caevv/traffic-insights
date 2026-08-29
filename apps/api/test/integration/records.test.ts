import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTrafficRecord,
  deleteTrafficRecord,
  getTrafficByCountry,
  getTrafficRecord,
  listTrafficRecords,
  updateTrafficRecord,
} from '../../src/modules/traffic/traffic.repository.ts'
import {
  ConflictError,
  NotFoundError,
  UnprocessableError,
} from '../../src/lib/errors.ts'
import { createTestDatabase, type TestDatabase } from '../helpers/database.ts'
import { seedFixtures } from '../helpers/fixtures.ts'

/** The write path — the "enable data updates" requirement. */
describe('traffic records', () => {
  let db: TestDatabase

  beforeAll(async () => {
    db = await createTestDatabase('records')
    await seedFixtures(db.pool)
  })

  afterAll(async () => {
    await db.destroy()
  })

  describe('createTrafficRecord', () => {
    it('creates a record and returns it with its dimension labels resolved', async () => {
      const record = await createTrafficRecord(db.pool, {
        country: 'JP',
        vehicleType: 'bus',
        recordedAt: new Date('2024-01-20T05:00:00Z'),
        vehicleCount: 42,
        avgSpeedKph: 33.5,
      })

      expect(record).toMatchObject({
        countryCode: 'JP',
        countryName: 'Japan',
        vehicleType: 'bus',
        vehicleTypeLabel: 'Bus',
        recordedAt: '2024-01-20T05:00:00Z',
        vehicleCount: 42,
        avgSpeedKph: 33.5,
      })
      expect(record.id).toBeGreaterThan(0)
    })

    it('rejects a duplicate of the natural key with a conflict', async () => {
      const draft = {
        country: 'SG',
        vehicleType: 'van',
        recordedAt: new Date('2024-01-21T06:00:00Z'),
        vehicleCount: 10,
        avgSpeedKph: 40,
      }

      await createTrafficRecord(db.pool, draft)

      // One observation per country x vehicle type x hour. Allowing a second
      // would double-count that hour in every chart, silently.
      await expect(createTrafficRecord(db.pool, draft)).rejects.toBeInstanceOf(
        ConflictError,
      )
    })

    it('reports an unknown country as unprocessable, not as a server error', async () => {
      await expect(
        createTrafficRecord(db.pool, {
          country: 'XX',
          vehicleType: 'car',
          recordedAt: new Date('2024-01-22T07:00:00Z'),
          vehicleCount: 1,
          avgSpeedKph: 10,
        }),
      ).rejects.toBeInstanceOf(UnprocessableError)
    })

    it('reports an unknown vehicle type the same way', async () => {
      await expect(
        createTrafficRecord(db.pool, {
          country: 'DE',
          vehicleType: 'hovercraft',
          recordedAt: new Date('2024-01-22T07:00:00Z'),
          vehicleCount: 1,
          avgSpeedKph: 10,
        }),
      ).rejects.toBeInstanceOf(UnprocessableError)
    })
  })

  describe('updateTrafficRecord', () => {
    it('applies a partial patch and leaves other columns alone', async () => {
      const created = await createTrafficRecord(db.pool, {
        country: 'CA',
        vehicleType: 'truck',
        recordedAt: new Date('2024-01-23T08:00:00Z'),
        vehicleCount: 100,
        avgSpeedKph: 70,
      })

      const updated = await updateTrafficRecord(db.pool, created.id, {
        vehicleCount: 250,
      })

      expect(updated.vehicleCount).toBe(250)
      expect(updated.avgSpeedKph).toBe(70)
      expect(updated.recordedAt).toBe(created.recordedAt)
    })

    it('bumps updated_at through the database trigger', async () => {
      const created = await createTrafficRecord(db.pool, {
        country: 'AU',
        vehicleType: 'car',
        recordedAt: new Date('2024-01-24T09:00:00Z'),
        vehicleCount: 5,
        avgSpeedKph: 55,
      })

      const { rows: before } = await db.pool.query<{ updated_at: Date }>(
        'SELECT updated_at FROM traffic_records WHERE id = $1',
        [created.id],
      )

      await updateTrafficRecord(db.pool, created.id, { vehicleCount: 6 })

      const { rows: after } = await db.pool.query<{ updated_at: Date }>(
        'SELECT updated_at FROM traffic_records WHERE id = $1',
        [created.id],
      )

      // The API never sets updated_at; the trigger does, so no writer can
      // forget it.
      expect(after[0]!.updated_at.getTime()).toBeGreaterThan(
        before[0]!.updated_at.getTime(),
      )
    })

    it('refuses a patch that would collide with an existing record', async () => {
      const first = await createTrafficRecord(db.pool, {
        country: 'ES',
        vehicleType: 'bus',
        recordedAt: new Date('2024-01-25T10:00:00Z'),
        vehicleCount: 1,
        avgSpeedKph: 20,
      })
      await createTrafficRecord(db.pool, {
        country: 'ES',
        vehicleType: 'bus',
        recordedAt: new Date('2024-01-25T11:00:00Z'),
        vehicleCount: 2,
        avgSpeedKph: 21,
      })

      await expect(
        updateTrafficRecord(db.pool, first.id, {
          recordedAt: new Date('2024-01-25T11:00:00Z'),
        }),
      ).rejects.toBeInstanceOf(ConflictError)
    })

    it('is a no-op — not an error — when the patch is empty', async () => {
      const created = await createTrafficRecord(db.pool, {
        country: 'NL',
        vehicleType: 'bicycle',
        recordedAt: new Date('2024-01-26T12:00:00Z'),
        vehicleCount: 77,
        avgSpeedKph: 18,
      })

      const result = await updateTrafficRecord(db.pool, created.id, {})

      expect(result).toEqual(created)
    })

    it('reports a missing id as not found', async () => {
      await expect(
        updateTrafficRecord(db.pool, 999_999_999, { vehicleCount: 1 }),
      ).rejects.toBeInstanceOf(NotFoundError)
    })
  })

  describe('deleteTrafficRecord', () => {
    it('removes the record and reports a second delete as not found', async () => {
      const created = await createTrafficRecord(db.pool, {
        country: 'KE',
        vehicleType: 'motorcycle',
        recordedAt: new Date('2024-01-27T13:00:00Z'),
        vehicleCount: 9,
        avgSpeedKph: 45,
      })

      await deleteTrafficRecord(db.pool, created.id)

      await expect(
        getTrafficRecord(db.pool, created.id),
      ).rejects.toBeInstanceOf(NotFoundError)
      await expect(
        deleteTrafficRecord(db.pool, created.id),
      ).rejects.toBeInstanceOf(NotFoundError)
    })
  })

  describe('listTrafficRecords', () => {
    it('paginates while reporting the unpaginated total', async () => {
      const page = await listTrafficRecords(
        db.pool,
        { countries: ['DE'] },
        { limit: 2, offset: 0 },
      )

      expect(page.items).toHaveLength(2)
      expect(page.limit).toBe(2)
      expect(page.offset).toBe(0)
      // Three German rows in the fixture set; the page shows two of them.
      expect(page.total).toBe(3)
    })

    it('orders newest first', async () => {
      const page = await listTrafficRecords(
        db.pool,
        { countries: ['DE'] },
        { limit: 10, offset: 0 },
      )

      const timestamps = page.items.map((item) => item.recordedAt)
      expect(timestamps).toEqual([...timestamps].sort().reverse())
    })

    it('does not leak the internal `total` column into each item', async () => {
      const page = await listTrafficRecords(
        db.pool,
        { countries: ['FR'] },
        { limit: 1, offset: 0 },
      )

      // `COUNT(*) OVER ()` rides along on every row; it must be stripped.
      expect(page.items[0]).not.toHaveProperty('total')
    })
  })

  it('a write is immediately visible in the aggregates', async () => {
    const before = await getTrafficByCountry(db.pool, { countries: ['MX'] })
    expect(before).toEqual([])

    const created = await createTrafficRecord(db.pool, {
      country: 'MX',
      vehicleType: 'car',
      recordedAt: new Date('2024-01-28T14:00:00Z'),
      vehicleCount: 1_000,
      avgSpeedKph: 65,
    })

    const after = await getTrafficByCountry(db.pool, { countries: ['MX'] })
    expect(after[0]).toMatchObject({ countryCode: 'MX', vehicleCount: 1_000 })

    await deleteTrafficRecord(db.pool, created.id)
    expect(await getTrafficByCountry(db.pool, { countries: ['MX'] })).toEqual(
      [],
    )
  })
})
