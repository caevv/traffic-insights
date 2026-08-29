/**
 * Vitest setup. Runs before any test file is imported.
 *
 * src/config/env.ts checks config at import time and throws if DATABASE_URL is
 * missing. These defaults have to exist before that happens, which is why they
 * live in setupFiles and not in a helper a test calls.
 */

process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = 'silent'

// No caching of aggregates in tests. Otherwise a test that writes a record
// and then checks the aggregate would read the previous test's response.
process.env.AGGREGATE_CACHE_MAX_AGE = '0'

// Rate limiting off. A test suite firing hundreds of requests a second is not
// the abuse the limiter is there for.
process.env.RATE_LIMIT_MAX = '1000000'

process.env.DATABASE_URL ??=
  process.env.TEST_DATABASE_URL ??
  'postgres://derq:derq_local_dev@localhost:5432/derq'
