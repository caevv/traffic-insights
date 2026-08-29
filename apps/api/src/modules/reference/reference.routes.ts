import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { env } from '../../config/env.ts'
import { referenceSchema } from '../traffic/traffic.schemas.ts'
import { getReference } from './reference.repository.ts'

/**
 * Dimension data for the dashboard filters.
 *
 * This basically never changes, so it gets a longer cache time than the
 * aggregates: ten minutes instead of one. It's also the first request the
 * frontend makes, so caching it saves a query on every repeat page load.
 */
export const referenceRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/reference',
    {
      // Ten times the aggregate lifetime. This is dimension data, so it
      // changes far less often than the numbers do.
      config: { cacheSeconds: env.AGGREGATE_CACHE_MAX_AGE * 10 },
      schema: {
        tags: ['reference'],
        summary: 'Countries, vehicle types, and the extent of the dataset',
        response: { 200: referenceSchema },
      },
    },
    async () => getReference(app.db),
  )
}
