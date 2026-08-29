import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import type { Db } from '../db/pool.ts'

declare module 'fastify' {
  interface FastifyInstance {
    /** The shared connection pool. Handlers use this, never a global import. */
    db: Db
  }
}

/**
 * Attach a connection pool to the instance.
 *
 * Injected rather than imported so a test can hand the app a pool pointed at a
 * throwaway database, and so ownership of the pool's lifecycle is explicit:
 * whoever created it decides whether closing the app also closes it. The API
 * server owns its pool; a test suite reuses one pool across many app instances
 * and would be broken by the app closing it on the first teardown.
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
