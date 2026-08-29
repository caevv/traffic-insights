import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { env } from '../../config/env.ts'
import { referenceSchema } from '../traffic/traffic.schemas.ts'
import { getReference } from './reference.repository.ts'

/**
 * Dimension data for the dashboard's filter controls.
 *
 * Reference data changes on the order of never, so it carries a longer cache
 * lifetime than the aggregates — ten minutes rather than one. It is also the
 * first request the frontend makes, so keeping it out of the database on
 * repeat visits removes a query from every cold page load.
 */
export const referenceRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/reference',
    {
      schema: {
        tags: ['reference'],
        summary: 'Countries, vehicle types, and the extent of the dataset',
        response: { 200: referenceSchema },
      },
    },
    async (_request, reply) => {
      reply.header(
        'Cache-Control',
        env.AGGREGATE_CACHE_MAX_AGE > 0
          ? `public, max-age=${env.AGGREGATE_CACHE_MAX_AGE * 10}`
          : 'no-store',
      )
      return getReference(app.db)
    },
  )
}
