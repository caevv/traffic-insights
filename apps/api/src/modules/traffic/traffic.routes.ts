import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { env } from '../../config/env.ts'
import * as repo from './traffic.repository.ts'
import {
  countryTrafficSchema,
  createRecordSchema,
  errorSchema,
  hourlyTrafficSchema,
  recordListQuerySchema,
  recordParamsSchema,
  trafficFilterSchema,
  trafficRecordPageSchema,
  trafficRecordSchema,
  trafficSummarySchema,
  updateRecordSchema,
  vehicleTypeTrafficSchema,
} from './traffic.schemas.ts'

export const trafficRoutes: FastifyPluginAsyncZod = async (app) => {
  const errorResponses = {
    400: errorSchema,
    422: errorSchema,
  }

  /**
   * The aggregates are pure functions of the query string, so they are safe for
   * a shared cache to hold. That is what lets a CDN or proxy absorb the
   * repeated dashboard polls that make up most of this traffic, and it is the
   * biggest single win going from 5 to 50 RPS.
   *
   * Worth being clear that the ETag is a different thing: it saves BANDWIDTH,
   * not database work. @fastify/etag hashes the serialised body in an onSend
   * hook, so a revalidation still runs the handler and still runs the query. It
   * just skips sending the body. What removes load is max-age, because then the
   * client sends no request at all.
   *
   * Everything not listed here is `no-store` by default. See the hook in app.ts.
   */
  const cacheable = { cacheSeconds: env.AGGREGATE_CACHE_MAX_AGE }

  // -------------------------------------------------------------------------
  // Aggregates (read-only)
  // -------------------------------------------------------------------------

  app.get(
    '/traffic/summary',
    {
      config: cacheable,
      schema: {
        tags: ['traffic'],
        summary: 'Headline totals for the current filter',
        querystring: trafficFilterSchema,
        response: { 200: trafficSummarySchema, ...errorResponses },
      },
    },
    async (request) => {
      return repo.getTrafficSummary(app.db, request.query)
    },
  )

  app.get(
    '/traffic/by-country',
    {
      config: cacheable,
      schema: {
        tags: ['traffic'],
        summary: 'Country-wise traffic volume',
        description:
          'Total vehicles and volume-weighted mean speed per country, ' +
          'biggest first. One GROUP BY in Postgres.',
        querystring: trafficFilterSchema,
        response: { 200: z.array(countryTrafficSchema), ...errorResponses },
      },
    },
    async (request) => {
      return repo.getTrafficByCountry(app.db, request.query)
    },
  )

  app.get(
    '/traffic/by-vehicle-type',
    {
      config: cacheable,
      schema: {
        tags: ['traffic'],
        summary: 'Vehicle type distribution',
        description:
          "Total vehicles per type, plus each type's share of the filtered " +
          'total. The shares add up to 1.',
        querystring: trafficFilterSchema,
        response: { 200: z.array(vehicleTypeTrafficSchema), ...errorResponses },
      },
    },
    async (request) => {
      return repo.getTrafficByVehicleType(app.db, request.query)
    },
  )

  app.get(
    '/traffic/by-hour',
    {
      config: cacheable,
      schema: {
        tags: ['traffic'],
        summary: 'Traffic rhythm by local hour of day',
        description:
          "Volume and speed by hour 0-23 in each country's own timezone, so " +
          'rush hours line up instead of smearing across the day.',
        querystring: trafficFilterSchema,
        response: { 200: z.array(hourlyTrafficSchema), ...errorResponses },
      },
    },
    async (request) => {
      return repo.getTrafficByHour(app.db, request.query)
    },
  )

  // -------------------------------------------------------------------------
  // Records (read + write)
  // -------------------------------------------------------------------------

  app.get(
    '/traffic/records',
    {
      config: cacheable,
      schema: {
        tags: ['records'],
        summary: 'List raw traffic records',
        querystring: recordListQuerySchema,
        response: { 200: trafficRecordPageSchema, ...errorResponses },
      },
    },
    async (request) => {
      const { limit, offset } = request.query
      return repo.listTrafficRecords(app.db, request.query, { limit, offset })
    },
  )

  app.post(
    '/traffic/records',
    {
      schema: {
        tags: ['records'],
        summary: 'Create a traffic record',
        description:
          'Data is hourly, so `recordedAt` is rounded down to its hour. ' +
          'Posting the same country, vehicle type and hour twice gives a ' +
          '409. Update the existing record instead.',
        body: createRecordSchema,
        response: {
          201: trafficRecordSchema,
          409: errorSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const record = await repo.createTrafficRecord(app.db, request.body)
      reply.status(201).header('Location', `${request.url}/${record.id}`)
      return record
    },
  )

  app.get(
    '/traffic/records/:id',
    {
      schema: {
        tags: ['records'],
        summary: 'Fetch one traffic record',
        params: recordParamsSchema,
        response: { 200: trafficRecordSchema, 404: errorSchema },
      },
    },
    async (request) => {
      return repo.getTrafficRecord(app.db, request.params.id)
    },
  )

  app.patch(
    '/traffic/records/:id',
    {
      schema: {
        tags: ['records'],
        summary: 'Update a traffic record',
        params: recordParamsSchema,
        body: updateRecordSchema,
        response: {
          200: trafficRecordSchema,
          404: errorSchema,
          409: errorSchema,
          ...errorResponses,
        },
      },
    },
    async (request) => {
      return repo.updateTrafficRecord(app.db, request.params.id, request.body)
    },
  )

  app.delete(
    '/traffic/records/:id',
    {
      schema: {
        tags: ['records'],
        summary: 'Delete a traffic record',
        params: recordParamsSchema,
        response: { 204: z.null(), 404: errorSchema },
      },
    },
    async (request, reply) => {
      await repo.deleteTrafficRecord(app.db, request.params.id)
      reply.status(204)
      return null
    },
  )
}
