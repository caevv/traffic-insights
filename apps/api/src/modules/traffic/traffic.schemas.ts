import { z } from 'zod'

/**
 * Request and response contracts.
 *
 * These are not decoration: Fastify validates every request against them and
 * serialises every response through them. A field the schema does not declare
 * never reaches a client, so a column added to a SELECT cannot silently leak,
 * and the OpenAPI document at `/docs` is generated from these same objects and
 * therefore cannot drift from the implementation.
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
 * Accept `?countries=DE,FR,US` as a comma-separated list.
 *
 * Capped at 64 entries so a hostile query string cannot make us build a
 * pathological `= ANY(...)` array.
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
 * The fact table's grain is one hour, so any instant is interpreted as the hour
 * it falls in. Truncating here — rather than rejecting — keeps the API honest
 * about its own resolution and guarantees the database CHECK can never fire.
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
    .describe('Vehicles observed during the hour'),
  avgSpeedKph: z
    .number()
    .gt(0)
    .max(300)
    .describe('Mean speed during the hour, km/h'),
}

export const createRecordSchema = z.object({
  country: countryCode,
  vehicleType: vehicleTypeCode,
  recordedAt: hourInstant.describe(
    'Any ISO 8601 instant; truncated to the hour it falls in',
  ),
  ...measures,
})

/** PATCH semantics: every field optional, at least one present. */
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
