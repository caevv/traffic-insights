import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import type { Db } from '../db/pool.ts'

declare module 'fastify' {
  interface FastifyInstance {
    /** The shared pool. Handlers use this instead of importing a global. */
    db: Db
  }
}

/**
 * Put a connection pool on the app instance.
 *
 * We pass it in instead of importing it so tests can hand the app a pool
 * pointing at a throwaway database. It also makes ownership clear: whoever
 * made the pool decides if closing the app closes it too. The server owns its
 * pool. Tests reuse one pool across several app instances, and would break if
 * the first teardown closed it.
 */
async function databasePlugin(
  app: FastifyInstance,
  options: { db: Db; closeOnShutdown?: boolean },
): Promise<void> {
  app.decorate('db', options.db)

  if (options.closeOnShutdown) {
    app.addHook('onClose', async () => {
      await options.db.end()
    })
  }
}

export default fp(databasePlugin, {
  name: 'database',
  fastify: '5.x',
})
