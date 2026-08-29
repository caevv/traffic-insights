/**
 * Load test the read endpoints and print a table.
 *
 * The numbers in docs/scalability.md come from here, so anyone can re-run it
 * and check them.
 *
 * Start the stack with the bench override first, or you will be measuring the
 * rate limiter and not the app:
 *
 *   docker compose -f docker-compose.yml -f docker-compose.bench.yml up -d
 *   npm run bench
 *   npm run bench -- --url=http://localhost:8080   (through nginx)
 *   npm run bench -- --duration=20
 *
 * Numbers off a laptop are not production numbers. What matters is the shape:
 * which endpoint is slowest, and how much the cache actually saves.
 */
import autocannon from 'autocannon'

type Scenario = {
  name: string
  path: string
  /** Sent as If-None-Match, to measure the 304 path. */
  etag?: string
}

type Row = {
  scenario: string
  connections: number
  rps: number
  p50: number
  p99: number
  bytesPerSec: number
  /** 4xx + 5xx. A 304 is a success here, so `non2xx` would be misleading. */
  errors: number
}

function parseFlag(name: string, fallback: number): number {
  const flag = process.argv.find((arg) => arg.startsWith(`--${name}=`))
  if (!flag) return fallback
  const value = Number(flag.slice(name.length + 3))
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function parseUrl(): string {
  const flag = process.argv.find((arg) => arg.startsWith('--url='))
  return (flag ? flag.slice('--url='.length) : 'http://localhost:3000').replace(
    /\/$/,
    '',
  )
}

const BASE_URL = parseUrl()
const DURATION = parseFlag('duration', 10)
const CONNECTION_LEVELS = [10, 50, 100]

const SCENARIOS: Scenario[] = [
  { name: 'by-country (30d)', path: '/api/v1/traffic/by-country?from=' },
  { name: 'by-country (all)', path: '/api/v1/traffic/by-country' },
  { name: 'by-vehicle-type', path: '/api/v1/traffic/by-vehicle-type' },
  // The one aggregate that can't use the covering indexes, because it needs
  // countries.timezone. Expect it to be the slowest.
  { name: 'by-hour', path: '/api/v1/traffic/by-hour' },
  { name: 'summary', path: '/api/v1/traffic/summary' },
  { name: 'records (50)', path: '/api/v1/traffic/records?limit=50' },
]

/** Thirty days back, rounded to the hour, same as the dashboard sends. */
function thirtyDaysAgo(): string {
  const hour = 60 * 60 * 1000
  return new Date(
    Math.floor((Date.now() - 30 * 24 * hour) / hour) * hour,
  ).toISOString()
}

async function run(scenario: Scenario, connections: number): Promise<Row> {
  const path = scenario.path.endsWith('from=')
    ? scenario.path + encodeURIComponent(thirtyDaysAgo())
    : scenario.path

  const result = await autocannon({
    url: `${BASE_URL}${path}`,
    connections,
    duration: DURATION,
    ...(scenario.etag ? { headers: { 'if-none-match': scenario.etag } } : {}),
  })

  return {
    scenario: scenario.name,
    connections,
    rps: Math.round(result.requests.average),
    p50: result.latency.p50,
    p99: result.latency.p99,
    bytesPerSec: Math.round(result.throughput.average),
    errors: result['4xx'] + result['5xx'],
  }
}

/** Grab an ETag so we can measure what a 304 costs versus a full response. */
async function fetchEtag(path: string): Promise<string | undefined> {
  const response = await fetch(`${BASE_URL}${path}`)
  return response.headers.get('etag') ?? undefined
}

async function main(): Promise<void> {
  console.log(`Load testing ${BASE_URL}`)
  console.log(
    `${DURATION}s per run, connections: ${CONNECTION_LEVELS.join(', ')}\n`,
  )

  const health = await fetch(`${BASE_URL}/health/ready`).catch(() => null)
  if (!health?.ok) {
    throw new Error(
      `${BASE_URL} is not ready. Start the stack first: docker compose up -d`,
    )
  }

  // Check the rate limiter is out of the way before spending minutes on runs
  // whose every request is a 429. Ask for more in one burst than the default
  // window allows and see what comes back.
  const probe = await Promise.all(
    Array.from({ length: 40 }, () =>
      fetch(`${BASE_URL}/api/v1/traffic/summary`),
    ),
  )
  const throttled = probe.filter((response) => response.status === 429).length
  if (throttled > 0) {
    throw new Error(
      'The API is rate limiting this client, so any result would just be ' +
        'measuring the limiter. Start the stack with the bench override:\n' +
        '  docker compose -f docker-compose.yml -f docker-compose.bench.yml up -d',
    )
  }

  const rows: Row[] = []

  for (const scenario of SCENARIOS) {
    for (const connections of CONNECTION_LEVELS) {
      rows.push(await run(scenario, connections))
    }
  }

  // The 304 path: same URL, but the client already has the body.
  const etag = await fetchEtag('/api/v1/traffic/by-country')
  if (etag) {
    for (const connections of CONNECTION_LEVELS) {
      rows.push(
        await run(
          {
            name: 'by-country (304)',
            path: '/api/v1/traffic/by-country',
            etag,
          },
          connections,
        ),
      )
    }
  }

  console.log(
    '\n| Endpoint            | Conns |    RPS | p50 ms | p99 ms |  MB/s | errors |',
  )
  console.log(
    '| ------------------- | ----- | ------ | ------ | ------ | ----- | ------ |',
  )
  for (const row of rows) {
    console.log(
      `| ${row.scenario.padEnd(19)} | ${String(row.connections).padStart(5)} | ` +
        `${String(row.rps).padStart(6)} | ${String(row.p50).padStart(6)} | ` +
        `${String(row.p99).padStart(6)} | ` +
        `${(row.bytesPerSec / 1_000_000).toFixed(1).padStart(5)} | ` +
        `${String(row.errors).padStart(6)} |`,
    )
  }
  const failed = rows.filter((row) => row.errors > 0)
  if (failed.length > 0) {
    console.error(
      `\n${failed.length} scenario(s) returned 4xx or 5xx responses. Those ` +
        `numbers measure errors, not throughput. Check the API logs.`,
    )
    process.exitCode = 1
    return
  }

  console.log('No 4xx or 5xx responses.\n')
}

try {
  await main()
} catch (error) {
  console.error('Benchmark failed:', error)
  process.exitCode = 1
}
