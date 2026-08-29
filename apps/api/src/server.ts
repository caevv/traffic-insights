import { buildApp } from './app.ts'
import { env } from './config/env.ts'
import { pool } from './db/pool.ts'

/**
 * Process entry point: build the app, listen, and shut down cleanly.
 *
 * Graceful shutdown is what makes rolling deploys and autoscaling
 * non-disruptive. On SIGTERM the server stops accepting new connections,
 * lets in-flight requests finish, then drains the pool. Without it every
 * scale-in event or deploy drops a handful of live requests — the kind of
 * error rate that only shows up once you are running more than one replica.
 */

const app = await buildApp({ db: pool, closeDbOnShutdown: true })

// If shutdown hangs — a wedged query, a socket that will not close — exit
// anyway rather than waiting for the orchestrator's SIGKILL.
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
