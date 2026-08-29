import { apiRequest } from '@/shared/lib/apiClient'
import type {
  CountryTraffic,
  DashboardFilters,
  HourlyTraffic,
  RecordDraft,
  Reference,
  TrafficRecord,
  TrafficRecordPage,
  TrafficSummary,
  VehicleTypeTraffic,
} from '../types'

const HOUR_MS = 60 * 60 * 1000

/**
 * Snap a filter's start time down to the top of the hour.
 *
 * This is the difference between a cache that works and one that never hits.
 * A raw `Date.now() - 7 days` produces a different millisecond on every
 * render, so every render would be a new query key, a new URL, a cache miss in
 * TanStack Query, and a miss on the server's `Cache-Control` too. Snapping to
 * the hour makes the key stable for an hour at a time — and the underlying
 * data has hourly grain anyway, so nothing is lost.
 */
function startOfHour(epochMs: number): string {
  return new Date(Math.floor(epochMs / HOUR_MS) * HOUR_MS).toISOString()
}

/** Build the query string shared by every aggregate endpoint. */
export function toQuery(filters: DashboardFilters): string {
  const params = new URLSearchParams()

  if (filters.rangeDays !== null) {
    params.set(
      'from',
      startOfHour(Date.now() - filters.rangeDays * 24 * HOUR_MS),
    )
  }
  if (filters.countries.length > 0) {
    params.set('countries', filters.countries.join(','))
  }
  if (filters.vehicleTypes.length > 0) {
    params.set('vehicleTypes', filters.vehicleTypes.join(','))
  }

  const query = params.toString()
  return query ? `?${query}` : ''
}

export const fetchReference = (signal?: AbortSignal) =>
  apiRequest<Reference>('/reference', signal ? { signal } : undefined)

export const fetchSummary = (filters: DashboardFilters, signal?: AbortSignal) =>
  apiRequest<TrafficSummary>(
    `/traffic/summary${toQuery(filters)}`,
    signal ? { signal } : undefined,
  )

export const fetchByCountry = (
  filters: DashboardFilters,
  signal?: AbortSignal,
) =>
  apiRequest<CountryTraffic[]>(
    `/traffic/by-country${toQuery(filters)}`,
    signal ? { signal } : undefined,
  )

export const fetchByVehicleType = (
  filters: DashboardFilters,
  signal?: AbortSignal,
) =>
  apiRequest<VehicleTypeTraffic[]>(
    `/traffic/by-vehicle-type${toQuery(filters)}`,
    signal ? { signal } : undefined,
  )

export const fetchByHour = (filters: DashboardFilters, signal?: AbortSignal) =>
  apiRequest<HourlyTraffic[]>(
    `/traffic/by-hour${toQuery(filters)}`,
    signal ? { signal } : undefined,
  )

export function fetchRecords(
  filters: DashboardFilters,
  limit: number,
  signal?: AbortSignal,
) {
  const query = toQuery(filters)
  const separator = query ? '&' : '?'
  return apiRequest<TrafficRecordPage>(
    `/traffic/records${query}${separator}limit=${limit}`,
    signal ? { signal } : undefined,
  )
}

export const createRecord = (draft: RecordDraft) =>
  apiRequest<TrafficRecord>('/traffic/records', {
    method: 'POST',
    body: JSON.stringify(draft),
  })

export const updateRecord = (id: number, patch: Partial<RecordDraft>) =>
  apiRequest<TrafficRecord>(`/traffic/records/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })

export const deleteRecord = (id: number) =>
  apiRequest<void>(`/traffic/records/${id}`, { method: 'DELETE' })
