import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

/**
 * Liveness and readiness are two different questions on purpose.
 *
 * /health/live asks "is this process stuck?". It must not touch the database.
 * If it did, one database hiccup would make the orchestrator kill every
 * healthy replica at once and turn a slow day into an outage.
 *
 * /health/ready asks "should this replica get traffic?", so it does check the
 * database. A replica that can't serve gets pulled from the load balancer
 * without being restarted.
 */
export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health/live',
    {
      schema: {
        tags: ['health'],
        summary: 'Liveness. Process only, never touches the database',
        response: {
          200: z.object({
            status: z.literal('ok'),
            uptimeSeconds: z.number(),
          }),
        },
      },
    },
    async () => ({
      status: 'ok' as const,
      uptimeSeconds: Math.round(process.uptime()),
    }),
  )

  app.get(
    '/health/ready',
    {
      schema: {
        tags: ['health'],
        summary: 'Readiness. Checks the database is reachable',
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
