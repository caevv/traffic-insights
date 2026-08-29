/**
 * The filters every aggregate endpoint takes. `from` is included, `to` is not.
 *
 * Each field is `?: T | undefined` rather than plain `?: T`. With
 * `exactOptionalPropertyTypes` those are different types, and a parsed query
 * string carries explicit `undefined` for anything the caller left out. Being
 * explicit here means a handler can pass `request.query` straight through
 * instead of rebuilding the object to strip the undefineds. Same reasoning as
 * TrafficRecordPatch at the bottom of this file.
 */
export type TrafficFilter = {
  from?: Date | undefined
  to?: Date | undefined
  /** ISO country codes. Empty or missing means all countries. */
  countries?: string[] | undefined
  /** Vehicle type codes. Empty or missing means all types. */
  vehicleTypes?: string[] | undefined
}

export type CountryTraffic = {
  countryCode: string
  countryName: string
  region: string
  vehicleCount: number
  /** Mean speed weighted by volume, km/h. */
  avgSpeedKph: number
}

export type VehicleTypeTraffic = {
  vehicleType: string
  label: string
  vehicleCount: number
  /** Share of the filtered total, 0..1. Adds up to 1 across the response. */
  share: number
  avgSpeedKph: number
}

export type HourlyTraffic = {
  /** Hour of day 0..23, in each country's local time. */
  hour: number
  vehicleCount: number
  avgSpeedKph: number
}

export type TrafficSummary = {
  totalVehicles: number
  avgSpeedKph: number
  recordCount: number
  countryCount: number
  /** Range of the data the filter matched. null when there is none. */
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

export type TrafficRecordInput = {
  country: string
  vehicleType: string
  recordedAt: Date
  vehicleCount: number
  avgSpeedKph: number
}

/**
 * PATCH body. Written out instead of Partial<TrafficRecordInput> because with
 * exactOptionalPropertyTypes those are different types. Partial means "may be
 * missing", but a parsed JSON body can also hold an explicit undefined. The
 * repository treats both as "leave this column alone".
 */
export type TrafficRecordPatch = {
  [K in keyof TrafficRecordInput]?: TrafficRecordInput[K] | undefined
}
