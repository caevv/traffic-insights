import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'
import {
  createRecord,
  deleteRecord,
  fetchByCountry,
  fetchByHour,
  fetchByVehicleType,
  fetchRecords,
  fetchReference,
  fetchSummary,
  updateRecord,
} from './trafficApi'
import type { DashboardFilters, RecordDraft, TrafficRecord } from '../types'

/**
 * Query keys are built from one factory rather than written inline.
 *
 * Inline key arrays are how cache bugs happen: a mutation invalidates
 * `['traffic','summary']` while the query registered
 * `['traffic','summary',filters]`, the invalidation silently matches nothing,
 * and the chart shows stale numbers with no error anywhere. One factory means
 * the writer and the reader cannot disagree.
 */
export const trafficKeys = {
  all: ['traffic'] as const,
  reference: () => [...trafficKeys.all, 'reference'] as const,
  summary: (filters: DashboardFilters) =>
    [...trafficKeys.all, 'summary', filters] as const,
  byCountry: (filters: DashboardFilters) =>
    [...trafficKeys.all, 'by-country', filters] as const,
  byVehicleType: (filters: DashboardFilters) =>
    [...trafficKeys.all, 'by-vehicle-type', filters] as const,
  byHour: (filters: DashboardFilters) =>
    [...trafficKeys.all, 'by-hour', filters] as const,
  records: (filters: DashboardFilters, limit: number) =>
    [...trafficKeys.all, 'records', filters, limit] as const,
}

/**
 * Reference data changes on the order of never, so it is effectively static
 * for the life of the session. Anything else would refetch the country list
 * every time the window regains focus, for nothing.
 */
export function useReference() {
  return useQuery({
    queryKey: trafficKeys.reference(),
    queryFn: ({ signal }) => fetchReference(signal),
    staleTime: Infinity,
  })
}

export function useSummary(filters: DashboardFilters) {
  return useQuery({
    queryKey: trafficKeys.summary(filters),
    queryFn: ({ signal }) => fetchSummary(filters, signal),
  })
}

export function useTrafficByCountry(filters: DashboardFilters) {
  return useQuery({
    queryKey: trafficKeys.byCountry(filters),
    queryFn: ({ signal }) => fetchByCountry(filters, signal),
  })
}

export function useTrafficByVehicleType(filters: DashboardFilters) {
  return useQuery({
    queryKey: trafficKeys.byVehicleType(filters),
    queryFn: ({ signal }) => fetchByVehicleType(filters, signal),
  })
}

export function useTrafficByHour(filters: DashboardFilters) {
  return useQuery({
    queryKey: trafficKeys.byHour(filters),
    queryFn: ({ signal }) => fetchByHour(filters, signal),
  })
}

export function useTrafficRecords(filters: DashboardFilters, limit: number) {
  return useQuery({
    queryKey: trafficKeys.records(filters, limit),
    queryFn: ({ signal }) => fetchRecords(filters, limit, signal),
  })
}

export type RecordMutations = {
  create: UseMutationResult<TrafficRecord, Error, RecordDraft>
  update: UseMutationResult<
    TrafficRecord,
    Error,
    { id: number; patch: Partial<RecordDraft> }
  >
  remove: UseMutationResult<void, Error, number>
}

/**
 * Writes invalidate the whole `traffic` key space.
 *
 * A new record shifts the country totals, the vehicle mix, the hourly curve
 * and the summary at once, so surgical invalidation would buy a rounding error
 * of network traffic in exchange for a real risk of leaving one chart
 * disagreeing with the others. Broad invalidation keeps the dashboard
 * internally consistent, which is the property that actually matters here.
 */
export function useRecordMutations(): RecordMutations {
  const queryClient = useQueryClient()
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trafficKeys.all })

  return {
    create: useMutation({
      mutationFn: (draft: RecordDraft) => createRecord(draft),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        patch,
      }: {
        id: number
        patch: Partial<RecordDraft>
      }) => updateRecord(id, patch),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: number) => deleteRecord(id),
      onSuccess: invalidate,
    }),
  }
}
