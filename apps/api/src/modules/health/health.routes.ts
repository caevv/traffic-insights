import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

/**
 * Liveness and readiness are deliberately different checks.
 *
 * `/health/live` answers "is this process wedged?" and must not touch the
 * database — if it did, a database blip would make every orchestrator kill
 * every otherwise-healthy replica at once, turning a degradation into an
 * outage.
 *
 * `/health/ready` answers "should this replica receive traffic?" and therefore
 * does check the database, so a replica that cannot serve is taken out of the
 * load balancer's rotation without being restarted.
 */
export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health/live',
    {
      schema: {
        tags: ['health'],
        summary: 'Liveness probe — process only, never touches the database',
        response: {
          200: z.object({
            status: z.literal('ok'),
            uptimeSeconds: z.number(),
          }),
        },
      },
    },
    async (_request, reply) => {
      reply.header('Cache-Control', 'no-store')
      return {
        status: 'ok' as const,
        uptimeSeconds: Math.round(process.uptime()),
      }
    },
  )

  app.get(
    '/health/ready',
    {
      schema: {
        tags: ['health'],
        summary: 'Readiness probe — verifies the database is reachable',
        response: {
          200: z.object({
            status: z.literal('ready'),
            database: z.literal('up'),
            latencyMs: z.number(),
          }),
          503: z.object({
            status: z.literal('not-ready'),
            database: z.literal('down'),
            reason: z.string(),
          }),
        },
      },
    },
    async (_request, reply) => {
      reply.header('Cache-Control', 'no-store')
      const startedAt = performance.now()

      try {
        await app.db.query('SELECT 1')
        return {
          status: 'ready' as const,
          database: 'up' as const,
          latencyMs: Math.round(performance.now() - startedAt),
        }
      } catch (error) {
        app.log.error({ err: error }, 'readiness check failed')
        reply.status(503)
        return {
          status: 'not-ready' as const,
          database: 'down' as const,
          reason: error instanceof Error ? error.message : 'unknown error',
        }
      }
    },
  )
}
