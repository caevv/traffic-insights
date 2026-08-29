/** Wire types — these mirror the API's response schemas exactly. */

export type CountryTraffic = {
  countryCode: string
  countryName: string
  region: string
  vehicleCount: number
  avgSpeedKph: number
}

export type VehicleTypeTraffic = {
  vehicleType: string
  label: string
  vehicleCount: number
  /** Fraction of the filtered total, 0..1. */
  share: number
  avgSpeedKph: number
}

export type HourlyTraffic = {
  /** Hour of day 0..23 in each country's own local time. */
  hour: number
  vehicleCount: number
  avgSpeedKph: number
}

export type TrafficSummary = {
  totalVehicles: number
  avgSpeedKph: number
  recordCount: number
  countryCount: number
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

export type TrafficRecordPage = {
  items: TrafficRecord[]
  total: number
  limit: number
  offset: number
}

export type Reference = {
  countries: { code: string; name: string; region: string }[]
  vehicleTypes: { code: string; label: string }[]
  range: { from: string | null; to: string | null }
}

export type RecordDraft = {
  country: string
  vehicleType: string
  recordedAt: string
  vehicleCount: number
  avgSpeedKph: number
}

/** What the user has selected. Converted to a query string by `toQuery`. */
export type DashboardFilters = {
  /** Days of history to include; `null` means the whole dataset. */
  rangeDays: number | null
  /** ISO country codes. Empty means every country. */
  countries: string[]
  /** Vehicle type codes. Empty means every type. */
  vehicleTypes: string[]
}
