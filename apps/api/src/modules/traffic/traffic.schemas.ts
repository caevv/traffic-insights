import { z } from 'zod'

/**
 * Request and response shapes.
 *
 * These do real work. Fastify checks every request against them and sends
 * every response through them. A field the schema doesn't list never reaches a
 * client, so adding a column to a SELECT can't leak it by accident. The
 * OpenAPI docs at /docs come from these same objects, so they can't drift.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const countryCode = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/, 'Expected an ISO 3166-1 alpha-2 code, e.g. "DE"')
  .transform((code) => code.toUpperCase())

const vehicleTypeCode = z
  .string()
  .trim()
  .regex(/^[A-Za-z_]{2,32}$/, 'Expected a vehicle type code, e.g. "truck"')
  .transform((code) => code.toLowerCase())

/**
 * Takes `?countries=DE,FR,US` as a comma-separated list.
 *
 * Capped at 64 so a nasty query string can't make us build a huge
 * `= ANY(...)` array.
 */
function commaSeparated<T extends z.ZodType<string, string>>(item: T) {
  return z
    .string()
    .transform((raw) =>
      raw
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0),
    )
    .pipe(z.array(item).min(1).max(64))
}

/**
 * Data is hourly, so any timestamp is read as the hour it falls in. We round
 * down instead of rejecting. That matches what the data means and makes sure
 * the database CHECK can never fire.
 */
const hourInstant = z.coerce
  .date()
  .refine(
    (value) => !Number.isNaN(value.getTime()),
    'Expected an ISO 8601 date',
  )
  .transform((value) => {
    const truncated = new Date(value)
    truncated.setUTCMinutes(0, 0, 0)
    return truncated
  })

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

export const trafficFilterSchema = z
  .object({
    from: z.coerce
      .date()
      .optional()
      .describe('Inclusive lower bound (ISO 8601)'),
    to: z.coerce.date().optional().describe('Exclusive upper bound (ISO 8601)'),
    countries: commaSeparated(countryCode)
      .optional()
      .describe('Comma-separated ISO 3166-1 alpha-2 codes, e.g. DE,FR'),
    vehicleTypes: commaSeparated(vehicleTypeCode)
      .optional()
      .describe('Comma-separated vehicle type codes, e.g. car,truck'),
  })
  .refine((value) => !value.from || !value.to || value.from < value.to, {
    message: '`from` must be earlier than `to`',
    path: ['from'],
  })

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const recordListQuerySchema = z.intersection(
  trafficFilterSchema,
  paginationSchema,
)

export const recordParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
})

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

const measures = {
  vehicleCount: z
    .number()
    .int()
    .min(0)
    .max(2_000_000_000)
    .describe('Vehicles counted during the hour'),
  avgSpeedKph: z
    .number()
    .gt(0)
    .max(300)
    .describe('Average speed during the hour, km/h'),
}

export const createRecordSchema = z.object({
  country: countryCode,
  vehicleType: vehicleTypeCode,
  recordedAt: hourInstant.describe(
    'Any ISO 8601 timestamp. Rounded down to its hour.',
  ),
  ...measures,
})

/** PATCH: every field optional, but you need at least one. */
export const updateRecordSchema = z
  .object({
    country: countryCode.optional(),
    vehicleType: vehicleTypeCode.optional(),
    recordedAt: hourInstant.optional(),
    vehicleCount: measures.vehicleCount.optional(),
    avgSpeedKph: measures.avgSpeedKph.optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    message: 'Provide at least one field to update',
  })

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const countryTrafficSchema = z.object({
  countryCode: z.string(),
  countryName: z.string(),
  region: z.string(),
  vehicleCount: z.number(),
  avgSpeedKph: z.number(),
})

export const vehicleTypeTrafficSchema = z.object({
  vehicleType: z.string(),
  label: z.string(),
  vehicleCount: z.number(),
  share: z.number(),
  avgSpeedKph: z.number(),
})

export const hourlyTrafficSchema = z.object({
  hour: z.number().int().min(0).max(23),
  vehicleCount: z.number(),
  avgSpeedKph: z.number(),
})

export const trafficSummarySchema = z.object({
  totalVehicles: z.number(),
  avgSpeedKph: z.number(),
  recordCount: z.number(),
  countryCount: z.number(),
  firstRecordedAt: z.string().nullable(),
  lastRecordedAt: z.string().nullable(),
})

export const trafficRecordSchema = z.object({
  id: z.number(),
  countryCode: z.string(),
  countryName: z.string(),
  vehicleType: z.string(),
  vehicleTypeLabel: z.string(),
  recordedAt: z.string(),
  vehicleCount: z.number(),
  avgSpeedKph: z.number(),
  updatedAt: z.string(),
})

export const trafficRecordPageSchema = z.object({
  items: z.array(trafficRecordSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
})

export const referenceSchema = z.object({
  countries: z.array(
    z.object({ code: z.string(), name: z.string(), region: z.string() }),
  ),
  vehicleTypes: z.array(z.object({ code: z.string(), label: z.string() })),
  range: z.object({
    from: z.string().nullable(),
    to: z.string().nullable(),
  }),
})

export const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
})
