import { z } from 'zod'

/**
 * Configuration is validated once, at process start, and never read from
 * `process.env` again. A bad value crashes the process immediately with a
 * readable message instead of surfacing as a confusing runtime error under
 * load — fail fast at boot, not at request 10,000.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),

  API_HOST: z.string().min(1).default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().max(65535).default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PG_POOL_MAX: z.coerce.number().int().positive().max(200).default(10),
  PG_STATEMENT_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(5_000),

  /** Comma-separated allowlist of browser origins. */
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:8080')
    .transform((raw) =>
      raw
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_WINDOW: z.string().min(1).default('1 minute'),

  /** Seconds of `Cache-Control: public, max-age=N` on aggregate endpoints. */
  AGGREGATE_CACHE_MAX_AGE: z.coerce.number().int().nonnegative().default(60),

  SEED_DAYS: z.coerce.number().int().positive().max(1_095).default(90),
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source)

  if (!parsed.success) {
    const details = parsed.error.issues
      .map(
        (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
      )
      .join('\n')
    throw new Error(`Invalid environment configuration:\n${details}`)
  }

  return parsed.data
}

/** Process-wide configuration. Import this, never `process.env`. */
export const env: Env = loadEnv()
