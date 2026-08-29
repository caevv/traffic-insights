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
 * Round a filter's start time down to the top of the hour.
 *
 * This is the difference between a cache that works and one that never hits.
 * A plain `Date.now() - 7 days` gives a different millisecond every render, so
 * every render would make a new query key, a new URL, a miss in TanStack Query
 * and a miss on the server's Cache-Control too. Rounding to the hour keeps the
 * key stable for an hour. The data is hourly anyway, so we lose nothing.
 */
function startOfHour(epochMs: number): string {
  return new Date(Math.floor(epochMs / HOUR_MS) * HOUR_MS).toISOString()
}

/**
 * Build the query parameters every aggregate endpoint takes.
 *
 * Returns URLSearchParams rather than a finished string, so a caller that
 * needs one more parameter can just .set() it. Returning a pre-joined "?a=b"
 * meant fetchRecords had to decide between "?" and "&" itself, which is
 * query-string assembly done a second time in a worse place.
 */
export function toQuery(filters: DashboardFilters): URLSearchParams {
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

  return params
}

function withQuery(path: string, params: URLSearchParams): string {
  const query = params.toString()
  return query ? `${path}?${query}` : path
}

/** Every aggregate is the same request with a different path and result type. */
function getAggregate<T>(
  path: string,
  filters: DashboardFilters,
  signal?: AbortSignal,
): Promise<T> {
  return apiRequest<T>(withQuery(path, toQuery(filters)), { signal })
}

export const fetchReference = (signal?: AbortSignal) =>
  apiRequest<Reference>('/reference', { signal })

export const fetchSummary = (filters: DashboardFilters, signal?: AbortSignal) =>
  getAggregate<TrafficSummary>('/traffic/summary', filters, signal)

export const fetchByCountry = (
  filters: DashboardFilters,
  signal?: AbortSignal,
) => getAggregate<CountryTraffic[]>('/traffic/by-country', filters, signal)

export const fetchByVehicleType = (
  filters: DashboardFilters,
  signal?: AbortSignal,
) =>
  getAggregate<VehicleTypeTraffic[]>(
    '/traffic/by-vehicle-type',
    filters,
    signal,
  )

export const fetchByHour = (filters: DashboardFilters, signal?: AbortSignal) =>
  getAggregate<HourlyTraffic[]>('/traffic/by-hour', filters, signal)

export function fetchRecords(
  filters: DashboardFilters,
  limit: number,
  signal?: AbortSignal,
) {
  const params = toQuery(filters)
  params.set('limit', String(limit))
  return apiRequest<TrafficRecordPage>(withQuery('/traffic/records', params), {
    signal,
  })
}

/**
 * The API stores hourly instants in UTC, and `datetime-local` hands us a plain
 * local string with no zone on it. The conversion belongs here, not in the
 * form: this module already owns the wire format for every read.
 */
export const createRecord = (draft: RecordDraft) =>
  apiRequest<TrafficRecord>('/traffic/records', {
    method: 'POST',
    body: JSON.stringify({
      ...draft,
      recordedAt: new Date(draft.recordedAt).toISOString(),
    }),
  })

export const updateRecord = (id: number, patch: Partial<RecordDraft>) =>
  apiRequest<TrafficRecord>(`/traffic/records/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(
      patch.recordedAt === undefined
        ? patch
        : { ...patch, recordedAt: new Date(patch.recordedAt).toISOString() },
    ),
  })

export const deleteRecord = (id: number) =>
  apiRequest<void>(`/traffic/records/${id}`, { method: 'DELETE' })
