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

/** Read a `statusCode` off an unknown thrown value without trusting its type. */
function httpStatusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const status = (error as { statusCode?: unknown }).statusCode
  return typeof status === 'number' ? status : undefined
}

export type BuildAppOptions = {
  db: Db
  /** End the pool when the app closes. The server sets this; tests do not. */
  closeDbOnShutdown?: boolean
}

/**
 * Build a fully wired app WITHOUT listening on a socket.
 *
 * Keeping construction separate from `listen()` is what makes the integration
 * tests fast and hermetic: they use `app.inject()` to drive real routing, real
 * validation and real SQL over an in-process request, with no port to bind and
 * no race to wait out.
 */
export async function buildApp(
  options: BuildAppOptions,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      // Strip the noisy default request/response serialisers down to the
      // fields that are actually useful in a log aggregator.
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
    // Trust the reverse proxy's X-Forwarded-* headers so rate limiting keys on
    // the real client IP rather than on the proxy's, which would otherwise
    // bucket every user in the world together.
    trustProxy: true,
    // Cap the body size: the write endpoints accept a single small object, so
    // anything larger is either a bug or an attack.
    bodyLimit: 64 * 1024,
    // Per-request logging stays on. It is the access log — the thing you
    // actually want when diagnosing a production incident — and `LOG_LEVEL`
    // already turns it off for an operator who decides the volume costs more
    // than it is worth. (Fastify's `disableRequestLogging` option is
    // deprecated in favour of a `logController` class; a level is a simpler
    // knob for the same outcome.)
  }).withTypeProvider<ZodTypeProvider>()

  // Zod drives BOTH directions: request validation and response serialisation.
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(databasePlugin, {
    db: options.db,
    closeOnShutdown: options.closeDbOnShutdown ?? false,
  })

  await app.register(helmet, {
    // The Swagger UI needs inline styles/scripts; the API itself serves only
    // JSON, so a strict CSP here would buy nothing and break the docs page.
    contentSecurityPolicy: false,
  })

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    maxAge: 86_400,
  })

  // ETag + the Cache-Control headers the routes set turn a repeated dashboard
  // poll into a 304 with no body — see docs/scalability.md.
  await app.register(etag, { weak: true })

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    // Health checks must never be throttled: a rate-limited readiness probe
    // makes an orchestrator evict a perfectly healthy replica.
    allowList: (request) => request.url.startsWith('/health'),
  })

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Traffic Insights API',
        description:
          'Aggregated traffic analytics. Every aggregate is computed by a ' +
          'single GROUP BY in PostgreSQL; no endpoint streams rows into the ' +
          'application to reduce them there.',
        version: '1.0.0',
      },
      servers: [{ url: API_PREFIX, description: 'Versioned API root' }],
      tags: [
        { name: 'traffic', description: 'Aggregated read models' },
        { name: 'records', description: 'Raw records — the write path' },
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
  // One error handler, one response shape — installed BEFORE the routes.
  //
  // Clients get `{ error: { code, message, details? } }` for every failure, so
  // the frontend has exactly one branch to write. Unexpected errors are logged
  // in full and reported as a bare 500 — internal messages and stack traces
  // are never echoed to a caller.
  //
  // Order matters and is not obvious: `setErrorHandler` is NOT retroactive.
  // Fastify copies the parent's handler into each child encapsulation context
  // at the moment `register()` creates it, so registering routes first would
  // leave every route on the default handler — which then fails to serialise
  // against the declared error schema. Only the error paths break that way, so
  // the bug survives any suite that exercises only happy paths.
  // ---------------------------------------------------------------------------
  app.setErrorHandler((error: unknown, request, reply) => {
    reply.header('Cache-Control', 'no-store')

    if (hasZodFastifySchemaValidationErrors(error)) {
      request.log.info({ err: error }, 'request failed validation')
      return reply.status(400).send({
        error: {
          code: 'BAD_REQUEST',
          message: 'Request failed validation.',
          // `instancePath` is a JSON Pointer ("/from"); clients want a plain
          // field path ("from"), and a nested one dotted rather than slashed.
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

    // Anything Fastify itself rejected (malformed JSON, unsupported media
    // type, oversized body) is the caller's fault and safe to describe.
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
