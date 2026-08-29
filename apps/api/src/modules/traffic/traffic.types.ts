/** Half-open time window `[from, to)`. Either bound may be omitted. */
export type TimeWindow = {
  from?: Date
  to?: Date
}

/** The filter set every aggregate endpoint accepts. */
export type TrafficFilter = TimeWindow & {
  /** ISO 3166-1 alpha-2 codes. Empty/omitted means "all countries". */
  countries?: string[]
  /** Vehicle type codes. Empty/omitted means "all vehicle types". */
  vehicleTypes?: string[]
}

export type CountryTraffic = {
  countryCode: string
  countryName: string
  region: string
  vehicleCount: number
  /** Volume-weighted mean speed, km/h. */
  avgSpeedKph: number
}

export type VehicleTypeTraffic = {
  vehicleType: string
  label: string
  vehicleCount: number
  /** Fraction of the filtered total, 0..1. Sums to 1 across the response. */
  share: number
  avgSpeedKph: number
}

export type HourlyTraffic = {
  /** Hour of day 0..23, in each country's own local time. */
  hour: number
  vehicleCount: number
  avgSpeedKph: number
}

export type TrafficSummary = {
  totalVehicles: number
  avgSpeedKph: number
  recordCount: number
  countryCount: number
  /** Bounds of the data actually matched by the filter; null when empty. */
  firstRecordedAt: string | null
  lastRecordedAt: string | null
}

export type TrafficRecord = {
  id: number
  countryCode: string
  countryName: string
  vehicleType: string
  vehicleTypeLabel: string
  recordedAt: string
  vehicleCount: number
  avgSpeedKph: number
  updatedAt: string
}

export type Page<T> = {
  items: T[]
  total: number
  limit: number
  offset: number
}

export type TrafficRecordInput = {
  country: string
  vehicleType: string
  recordedAt: Date
  vehicleCount: number
  avgSpeedKph: number
}

/**
 * PATCH payload. Spelled out rather than `Partial<TrafficRecordInput>` because
 * `exactOptionalPropertyTypes` makes those two different types: `Partial` means
 * "may be absent", while a parsed JSON body can also carry an explicit
 * `undefined`. The repository treats both as "leave this column alone".
 */
export type TrafficRecordPatch = {
  [K in keyof TrafficRecordInput]?: TrafficRecordInput[K] | undefined
}
