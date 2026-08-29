import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyReply } from 'fastify'
import { z } from 'zod'
import { env } from '../../config/env.ts'
import * as repo from './traffic.repository.ts'
import {
  countryTrafficSchema,
  createRecordSchema,
  errorSchema,
  hourlyTrafficSchema,
  paginationSchema,
  recordListQuerySchema,
  recordParamsSchema,
  trafficFilterSchema,
  trafficRecordPageSchema,
  trafficRecordSchema,
  trafficSummarySchema,
  updateRecordSchema,
  vehicleTypeTrafficSchema,
} from './traffic.schemas.ts'
import type { TrafficFilter } from './traffic.types.ts'

/**
 * The aggregates only depend on the query string, so they're safe to cache. A
 * shared max-age lets a CDN or proxy soak up the repeated dashboard polls that
 * make up most of this traffic. It's the biggest single win going from 5 to 50
 * RPS. With @fastify/etag on top, a client whose cache just went stale gets a
 * 304 with no body and no database query.
 */
function setAggregateCacheHeaders(reply: FastifyReply): void {
  reply.header(
    'Cache-Control',
    env.AGGREGATE_CACHE_MAX_AGE > 0
      ? `public, max-age=${env.AGGREGATE_CACHE_MAX_AGE}`
      : 'no-store',
  )
}

/** A write changes every aggregate, so never let its response be cached. */
function setNoStore(reply: FastifyReply): void {
  reply.header('Cache-Control', 'no-store')
}

type FilterQuery = z.infer<typeof trafficFilterSchema>

function toFilter(query: FilterQuery): TrafficFilter {
  return {
    ...(query.from ? { from: query.from } : {}),
    ...(query.to ? { to: query.to } : {}),
    ...(query.countries ? { countries: query.countries } : {}),
    ...(query.vehicleTypes ? { vehicleTypes: query.vehicleTypes } : {}),
  }
}

export const trafficRoutes: FastifyPluginAsyncZod = async (app) => {
  const errorResponses = {
    400: errorSchema,
    422: errorSchema,
  }

  // -------------------------------------------------------------------------
  // Aggregates (read-only)
  // -------------------------------------------------------------------------

  app.get(
    '/traffic/summary',
    {
      schema: {
        tags: ['traffic'],
        summary: 'Headline totals for the current filter',
        querystring: trafficFilterSchema,
        response: { 200: trafficSummarySchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      setAggregateCacheHeaders(reply)
      return repo.getTrafficSummary(app.db, toFilter(request.query))
    },
  )

  app.get(
    '/traffic/by-country',
    {
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
    async (request, reply) => {
      setAggregateCacheHeaders(reply)
      return repo.getTrafficByCountry(app.db, toFilter(request.query))
    },
  )

  app.get(
    '/traffic/by-vehicle-type',
    {
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
    async (request, reply) => {
      setAggregateCacheHeaders(reply)
      return repo.getTrafficByVehicleType(app.db, toFilter(request.query))
    },
  )

  app.get(
    '/traffic/by-hour',
    {
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
    async (request, reply) => {
      setAggregateCacheHeaders(reply)
      return repo.getTrafficByHour(app.db, toFilter(request.query))
    },
  )

  // -------------------------------------------------------------------------
  // Records (read + write)
  // -------------------------------------------------------------------------

  app.get(
    '/traffic/records',
    {
      schema: {
        tags: ['records'],
        summary: 'List raw traffic records',
        querystring: recordListQuerySchema,
        response: { 200: trafficRecordPageSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      setAggregateCacheHeaders(reply)
      const { limit, offset } = paginationSchema.parse(request.query)
      return repo.listTrafficRecords(app.db, toFilter(request.query), {
        limit,
        offset,
      })
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
      setNoStore(reply)
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
    async (request, reply) => {
      setAggregateCacheHeaders(reply)
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
    async (request, reply) => {
      setNoStore(reply)
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
      setNoStore(reply)
      reply.status(204)
      return null
    },
  )
}
