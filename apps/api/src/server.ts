import { buildApp } from './app.ts'
import { env } from './config/env.ts'
import { pool } from './db/pool.ts'

/**
 * Entry point. Build the app, listen, shut down cleanly.
 *
 * Clean shutdown is what makes rolling deploys and autoscaling invisible to
 * users. On SIGTERM we stop taking new connections, let the in-flight requests
 * finish, then drain the pool. Without it, every deploy or scale-down drops a
 * handful of live requests. That error rate only shows up once you run more
 * than one replica.
 */

const app = await buildApp({ db: pool, closeDbOnShutdown: true })

// If shutdown hangs, say on a stuck query or a socket that won't close, exit
// anyway instead of waiting for the orchestrator to SIGKILL us.
const FORCED_EXIT_AFTER_MS = 10_000

let shuttingDown = false

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true

  app.log.info({ signal }, 'shutting down')

  const forceExit = setTimeout(() => {
    app.log.error('graceful shutdown timed out; exiting')
    process.exit(1)
  }, FORCED_EXIT_AFTER_MS)
  forceExit.unref()

  try {
    await app.close()
    app.log.info('shutdown complete')
    process.exit(0)
  } catch (error) {
    app.log.error({ err: error }, 'error during shutdown')
    process.exit(1)
  }
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => void shutdown(signal))
}

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT })
} catch (error) {
  app.log.error({ err: error }, 'failed to start')
  process.exit(1)
}
