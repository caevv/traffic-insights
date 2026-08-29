import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import etag from '@fastify/etag'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { env } from './config/env.ts'
import type { Db } from './db/pool.ts'
import { AppError } from './lib/errors.ts'
import databasePlugin from './plugins/database.ts'
import { healthRoutes } from './modules/health/health.routes.ts'
import { referenceRoutes } from './modules/reference/reference.routes.ts'
import { trafficRoutes } from './modules/traffic/traffic.routes.ts'

export const API_PREFIX = '/api/v1'

declare module 'fastify' {
  interface FastifyContextConfig {
    /**
     * Seconds this route may be cached by a shared cache. Omit it and the
     * route is `no-store`.
     */
    cacheSeconds?: number
  }
}

/** Pull a statusCode off an unknown thrown value without trusting its type. */
function httpStatusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const status = (error as { statusCode?: unknown }).statusCode
  return typeof status === 'number' ? status : undefined
}

export type BuildAppOptions = {
  db: Db
  /** Close the pool when the app closes. The server does, tests don't. */
  closeDbOnShutdown?: boolean
}

/**
 * Build the whole app but don't listen on a socket.
 *
 * Keeping this separate from listen() is what makes the tests fast. They use
 * app.inject() to run real routing, real validation and real SQL in-process,
 * with no port to bind and no start-up race to wait for.
 */
export async function buildApp(
  options: BuildAppOptions,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      // Trim the default request logging down to the fields that are
      // actually useful once the logs are in a search tool.
      serializers: {
        req: (request) => ({
          method: request.method,
          url: request.url,
        }),
      },
      ...(env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
        : {}),
    },
    // Trust the proxy's X-Forwarded-* headers so rate limiting uses the real
    // client IP. Otherwise every user shares the proxy's one bucket.
    trustProxy: true,
    // Cap the body size. The write endpoints take one small object, so
    // anything bigger is a bug or an attack.
    bodyLimit: 64 * 1024,
    // Per-request logging stays on. That's the access log, and it's what you
    // want when something breaks in production. LOG_LEVEL already turns it off
    // if the volume isn't worth it. (Fastify's disableRequestLogging option is
    // deprecated now in favour of a logController class. A log level is a
    // simpler knob for the same thing.)
  }).withTypeProvider<ZodTypeProvider>()

  // Zod does both directions: checking requests and serialising responses.
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // ---------------------------------------------------------------------------
  // Cache-Control, in one place.
  //
  // Every response is `no-store` unless the route opts in with
  // `config: { cacheSeconds: n }`. Doing this per handler meant the policy was
  // written out at a dozen call sites, and a route added later would simply
  // have no Cache-Control at all, which lets a proxy invent its own freshness.
  // A default you have to opt out of is the safe direction for that mistake.
  //
  // `max-age=0, s-maxage=N` and not plain `max-age=N`, which is a real bug I
  // shipped and then caught in the browser. The dashboard writes the data it
  // displays. With `max-age=60` the browser served its own cached copy back to
  // the refetch that follows a write, so you could edit a row and watch the
  // table keep showing the old number for a minute. It looked fine in
  // development only because AGGREGATE_CACHE_MAX_AGE is 0 there.
  //
  // `max-age=0` makes the browser revalidate every time, which is cheap: the
  // ETag turns it into a 304 with no body. `s-maxage=N` still lets a CDN or
  // reverse proxy serve the response for N seconds without touching us, which
  // is where the actual load reduction comes from anyway.
  // ---------------------------------------------------------------------------
  app.addHook('onRequest', async (request, reply) => {
    const seconds = request.routeOptions.config.cacheSeconds
    reply.header(
      'Cache-Control',
      seconds && seconds > 0
        ? `public, max-age=0, s-maxage=${seconds}`
        : 'no-store',
    )
  })

  await app.register(databasePlugin, {
    db: options.db,
    closeOnShutdown: options.closeDbOnShutdown ?? false,
  })

  await app.register(helmet, {
    // The Swagger UI needs inline styles and scripts. The API only serves
    // JSON, so a strict CSP here would gain nothing and break the docs page.
    contentSecurityPolicy: false,
  })

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    maxAge: 86_400,
  })

  // ETag plus the Cache-Control headers the routes set turn a repeated
  // dashboard poll into a 304 with no body. See docs/scalability.md.
  await app.register(etag, { weak: true })

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    // Never rate limit health checks. A throttled readiness probe makes the
    // orchestrator drop a perfectly healthy replica.
    allowList: (request) => request.url.startsWith('/health'),
  })

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Traffic Insights API',
        description:
          'Traffic analytics. Every aggregate is one GROUP BY in PostgreSQL. ' +
          'No endpoint pulls rows into the app to add them up there.',
        version: '1.0.0',
      },
      servers: [{ url: API_PREFIX, description: 'Versioned API root' }],
      tags: [
        { name: 'traffic', description: 'Aggregated read models' },
        { name: 'records', description: 'Raw records. The write path.' },
        { name: 'reference', description: 'Dimension data for filters' },
        { name: 'health', description: 'Liveness and readiness probes' },
      ],
    },
    transform: jsonSchemaTransform,
  })

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  })

  // ---------------------------------------------------------------------------
  // One error handler, one response shape. Set up BEFORE the routes.
  //
  // Clients get `{ error: { code, message, details? } }` for every failure, so
  // the frontend only needs one branch. Unexpected errors get logged in full
  // and returned as a plain 500. We never send internal messages or stack
  // traces back to a caller.
  //
  // The order matters and it's not obvious: setErrorHandler does not apply to
  // routes that are already registered. Fastify copies the parent handler into
  // each child context when register() runs, so registering routes first
  // leaves them all on the default handler, which then fails to serialise
  // against our error schema. Only the error paths break, so this bug survives
  // any test suite that only checks happy paths.
  // ---------------------------------------------------------------------------
  app.setErrorHandler((error: unknown, request, reply) => {
    reply.header('Cache-Control', 'no-store')

    if (hasZodFastifySchemaValidationErrors(error)) {
      request.log.info({ err: error }, 'request failed validation')
      return reply.status(400).send({
        error: {
          code: 'BAD_REQUEST',
          message: 'Request failed validation.',
          // instancePath is a JSON Pointer like "/from". Clients want a
          // plain field name, and dots for nested ones.
          details: error.validation.map((issue) => ({
            path: issue.instancePath.replace(/^\//, '').replaceAll('/', '.'),
            message: issue.message ?? 'Invalid value',
          })),
        },
      })
    }

    if (error instanceof AppError) {
      request.log.info({ err: error }, 'request rejected')
      return reply.status(error.status).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      })
    }

    const status = httpStatusOf(error)

    if (status === 429) {
      return reply.status(429).send({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Slow down and retry.',
        },
      })
    }

    // Anything Fastify rejected itself (bad JSON, wrong content type, body
    // too big) is the caller's fault and safe to explain.
    if (status !== undefined && status < 500) {
      return reply.status(status).send({
        error: {
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Bad request.',
        },
      })
    }

    request.log.error({ err: error }, 'unhandled error')
    return reply.status(500).send({
      error: {
        code: 'INTERNAL',
        message: 'Something went wrong handling this request.',
      },
    })
  })

  app.setNotFoundHandler((request, reply) => {
    reply.header('Cache-Control', 'no-store')
    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} does not exist.`,
      },
    })
  })

  await app.register(healthRoutes)
  await app.register(trafficRoutes, { prefix: API_PREFIX })
  await app.register(referenceRoutes, { prefix: API_PREFIX })

  return app
}
