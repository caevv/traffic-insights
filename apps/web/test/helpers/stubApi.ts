import { vi } from 'vitest'
import type {
  CountryTraffic,
  HourlyTraffic,
  Reference,
  TrafficRecordPage,
  TrafficSummary,
  VehicleTypeTraffic,
} from '@/features/traffic-dashboard/types'

/**
 * We stub fetch itself, not our own modules.
 *
 * That way the tests still run the real apiClient, the real query-string
 * building and the real TanStack Query cache. Mocking the query hooks instead
 * would leave all of that untested and still give a green suite.
 */

const REFERENCE: Reference = {
  countries: [
    { code: 'DE', name: 'Germany', region: 'Europe' },
    { code: 'FR', name: 'France', region: 'Europe' },
  ],
  vehicleTypes: [
    { code: 'car', label: 'Car' },
    { code: 'truck', label: 'Truck' },
  ],
  range: { from: '2024-01-15T08:00:00Z', to: '2024-01-16T08:00:00Z' },
}

const BY_COUNTRY: CountryTraffic[] = [
  {
    countryCode: 'DE',
    countryName: 'Germany',
    region: 'Europe',
    vehicleCount: 500,
    avgSpeedKph: 44,
  },
  {
    countryCode: 'FR',
    countryName: 'France',
    region: 'Europe',
    vehicleCount: 200,
    avgSpeedKph: 60,
  },
]

const BY_VEHICLE_TYPE: VehicleTypeTraffic[] = [
  {
    vehicleType: 'car',
    label: 'Car',
    vehicleCount: 600,
    share: 600 / 700,
    avgSpeedKph: 42,
  },
  {
    vehicleType: 'truck',
    label: 'Truck',
    vehicleCount: 100,
    share: 100 / 700,
    avgSpeedKph: 80,
  },
]

const BY_HOUR: HourlyTraffic[] = [
  { hour: 9, vehicleCount: 400, avgSpeedKph: 52.5 },
  { hour: 10, vehicleCount: 300, avgSpeedKph: 30 },
]

const SUMMARY: TrafficSummary = {
  totalVehicles: 700,
  avgSpeedKph: 48.6,
  recordCount: 4,
  countryCount: 2,
  firstRecordedAt: '2024-01-15T08:00:00Z',
  lastRecordedAt: '2024-01-16T08:00:00Z',
}

const RECORDS: TrafficRecordPage = {
  items: [
    {
      id: 1,
      countryCode: 'DE',
      countryName: 'Germany',
      vehicleType: 'car',
      vehicleTypeLabel: 'Car',
      recordedAt: '2024-01-15T09:00:00Z',
      vehicleCount: 300,
      avgSpeedKph: 30,
      updatedAt: '2024-01-15T09:05:00Z',
    },
  ],
  total: 4,
  limit: 8,
  offset: 0,
}

export type StubbedApi = {
  /** Every URL requested, in order. Check what the app really asked for. */
  calls: { url: string; method: string }[]
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function stubApi(
  overrides: Partial<Record<string, unknown>> = {},
): StubbedApi {
  const calls: StubbedApi['calls'] = []

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, method: init?.method ?? 'GET' })

      for (const [fragment, body] of Object.entries(overrides)) {
        if (url.includes(fragment)) return jsonResponse(body)
      }

      if (url.includes('/reference')) return jsonResponse(REFERENCE)
      if (url.includes('/traffic/summary')) return jsonResponse(SUMMARY)
      if (url.includes('/traffic/by-country')) return jsonResponse(BY_COUNTRY)
      if (url.includes('/traffic/by-vehicle-type')) {
        return jsonResponse(BY_VEHICLE_TYPE)
      }
      if (url.includes('/traffic/by-hour')) return jsonResponse(BY_HOUR)
      if (url.includes('/traffic/records')) return jsonResponse(RECORDS)

      return new Response('not found', { status: 404 })
    }),
  )

  return { calls }
}
