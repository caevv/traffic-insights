import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp, API_PREFIX } from '../../src/app.ts'
import { createTestDatabase, type TestDatabase } from '../helpers/database.ts'
import { EXPECTED, seedFixtures } from '../helpers/fixtures.ts'

/**
 * The HTTP layer, driven through app.inject().
 *
 * inject runs the real router, real Zod validation and real SQL over an
 * in-process request. No socket, no port to race on. So these are as fast as
 * unit tests but still cover what unit tests miss: status codes, headers,
 * serialisation and the error handler.
 */
describe('HTTP API', () => {
  let db: TestDatabase
  let app: FastifyInstance

  beforeAll(async () => {
    db = await createTestDatabase('http')
    await seedFixtures(db.pool)
    // closeDbOnShutdown stays false. The test owns the pool.
    app = await buildApp({ db: db.pool })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    await db.destroy()
  })

  describe('health probes', () => {
    it('reports liveness without touching the database', async () => {
      const response = await app.inject({ method: 'GET', url: '/health/live' })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({ status: 'ok' })
    })

    it('reports readiness after querying the database', async () => {
      const response = await app.inject({ method: 'GET', url: '/health/ready' })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        status: 'ready',
        database: 'up',
      })
    })

    it('never caches a probe response', async () => {
      const response = await app.inject({ method: 'GET', url: '/health/live' })

      expect(response.headers['cache-control']).toBe('no-store')
    })
  })

  describe('GET /traffic/by-country', () => {
    it('returns the aggregate as JSON', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `${API_PREFIX}/traffic/by-country`,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual([
        expect.objectContaining({
          countryCode: 'DE',
          vehicleCount: EXPECTED.germany.vehicles,
          avgSpeedKph: EXPECTED.germany.weightedSpeed,
        }),
        expect.objectContaining({
          countryCode: 'FR',
          vehicleCount: EXPECTED.france.vehicles,
        }),
      ])
    })

    it('accepts a comma-separated country list and upper-cases it', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `${API_PREFIX}/traffic/by-country?countries=de,fr`,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toHaveLength(2)
    })

    it('sends an ETag so an unchanged aggregate costs a 304', async () => {
      const first = await app.inject({
        method: 'GET',
        url: `${API_PREFIX}/traffic/by-country`,
      })
      const etag = first.headers.etag
      expect(etag).toBeTruthy()

      const second = await app.inject({
        method: 'GET',
        url: `${API_PREFIX}/traffic/by-country`,
        headers: { 'if-none-match': String(etag) },
      })

      expect(second.statusCode).toBe(304)
      expect(second.body).toBe('')
    })
  })

  describe('request validation', () => {
    it('rejects a country code that is not two letters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `${API_PREFIX}/traffic/by-country?countries=GERMANY`,
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({
        error: { code: 'BAD_REQUEST' },
      })
    })

    it('rejects a window whose end precedes its start', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `${API_PREFIX}/traffic/by-country?from=2024-02-01T00:00:00Z&to=2024-01-01T00:00:00Z`,
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().error.details).toEqual([
        expect.objectContaining({
          message: '`from` must be earlier than `to`',
        }),
      ])
    })

    it('rejects a speed outside the plausible range before it reaches the database', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `${API_PREFIX}/traffic/records`,
        payload: {
          country: 'DE',
          vehicleType: 'car',
          recordedAt: '2024-03-01T08:00:00Z',
          vehicleCount: 10,
          avgSpeedKph: 999,
        },
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('POST /traffic/records', () => {
    it('creates a record and truncates the instant to its hour', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `${API_PREFIX}/traffic/records`,
        payload: {
          country: 'gb',
          vehicleType: 'VAN',
          // 34 minutes past the hour. The data is hourly.
          recordedAt: '2024-03-02T14:34:21Z',
          vehicleCount: 500,
          avgSpeedKph: 58.25,
        },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json()).toMatchObject({
        countryCode: 'GB',
        vehicleType: 'van',
        recordedAt: '2024-03-02T14:00:00Z',
      })
      expect(response.headers.location).toContain('/traffic/records/')
    })

    it('answers a duplicate with 409, not 500', async () => {
      const payload = {
        country: 'IN',
        vehicleType: 'bus',
        recordedAt: '2024-03-03T09:00:00Z',
        vehicleCount: 20,
        avgSpeedKph: 35,
      }

      const created = await app.inject({
        method: 'POST',
        url: `${API_PREFIX}/traffic/records`,
        payload,
      })
      expect(created.statusCode).toBe(201)

      const duplicate = await app.inject({
        method: 'POST',
        url: `${API_PREFIX}/traffic/records`,
        payload,
      })

      expect(duplicate.statusCode).toBe(409)
      expect(duplicate.json()).toMatchObject({ error: { code: 'CONFLICT' } })
    })

    it('answers an unknown dimension with 422, not 500', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `${API_PREFIX}/traffic/records`,
        payload: {
          country: 'ZZ',
          vehicleType: 'car',
          recordedAt: '2024-03-04T09:00:00Z',
          vehicleCount: 1,
          avgSpeedKph: 20,
        },
      })

      expect(response.statusCode).toBe(422)
      expect(response.json()).toMatchObject({
        error: { code: 'UNPROCESSABLE' },
      })
    })

    it('never allows a write response to be cached', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `${API_PREFIX}/traffic/records`,
        payload: {
          country: 'ZA',
          vehicleType: 'car',
          recordedAt: '2024-03-05T09:00:00Z',
          vehicleCount: 1,
          avgSpeedKph: 20,
        },
      })

      expect(response.headers['cache-control']).toBe('no-store')
    })
  })

  describe('PATCH and DELETE /traffic/records/:id', () => {
    it('updates and then deletes a record', async () => {
      const created = await app.inject({
        method: 'POST',
        url: `${API_PREFIX}/traffic/records`,
        payload: {
          country: 'BR',
          vehicleType: 'truck',
          recordedAt: '2024-03-06T09:00:00Z',
          vehicleCount: 10,
          avgSpeedKph: 70,
        },
      })
      const { id } = created.json()

      const patched = await app.inject({
        method: 'PATCH',
        url: `${API_PREFIX}/traffic/records/${id}`,
        payload: { vehicleCount: 99 },
      })
      expect(patched.statusCode).toBe(200)
      expect(patched.json().vehicleCount).toBe(99)

      const removed = await app.inject({
        method: 'DELETE',
        url: `${API_PREFIX}/traffic/records/${id}`,
      })
      expect(removed.statusCode).toBe(204)

      const missing = await app.inject({
        method: 'DELETE',
        url: `${API_PREFIX}/traffic/records/${id}`,
      })
      expect(missing.statusCode).toBe(404)
    })

    it('rejects an empty patch body', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `${API_PREFIX}/traffic/records/1`,
        payload: {},
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('GET /reference', () => {
    it('returns the dimensions and the extent of the data in one request', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `${API_PREFIX}/reference`,
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.countries).toHaveLength(16)
      expect(body.vehicleTypes).toHaveLength(6)
      expect(body.countries[0]).toMatchObject({ code: expect.any(String) })
      expect(body.range.from).toBe('2024-01-15T08:00:00Z')
    })
  })

  describe('error handling', () => {
    it('answers an unknown route with the same envelope as every other error', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `${API_PREFIX}/does-not-exist`,
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } })
    })
  })

  describe('OpenAPI document', () => {
    it('is generated from the same schemas the routes enforce', async () => {
      const spec = app.swagger()

      expect(spec.paths?.['/traffic/by-country']).toBeDefined()
      expect(spec.paths?.['/traffic/records']).toBeDefined()
      expect(spec.info.title).toBe('Traffic Insights API')
    })
  })
})
