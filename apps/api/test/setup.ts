/**
 * Vitest setup — runs before any test module is imported.
 *
 * `src/config/env.ts` validates configuration at import time and throws on a
 * missing `DATABASE_URL`. These defaults have to be in place before that
 * happens, which is why they live in `setupFiles` rather than in a helper a
 * test would call.
 */

process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = 'silent'

// Aggregate responses must not be cached during tests: a test that writes a
// record and then asserts on the aggregate would otherwise read the response
// the previous test warmed.
process.env.AGGREGATE_CACHE_MAX_AGE = '0'

// Rate limiting off — a suite that fires hundreds of requests in a second is
// not the abuse the limiter exists to stop.
process.env.RATE_LIMIT_MAX = '1000000'

process.env.DATABASE_URL ??=
  process.env.TEST_DATABASE_URL ??
  'postgres://derq:derq_local_dev@localhost:5432/derq'
