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
 * Query keys come from one factory, not written inline.
 *
 * Inline key arrays are how cache bugs happen. A mutation invalidates
 * ['traffic','summary'] but the query registered
 * ['traffic','summary',filters], the invalidation matches nothing, and the
 * chart shows old numbers with no error anywhere. One factory means the writer
 * and the reader can't disagree.
 */
const trafficKeys = {
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
 * Reference data basically never changes, so treat it as fixed for the
 * session. Otherwise we'd refetch the country list every time the window gets
 * focus, for nothing.
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
 * A write invalidates every `traffic` key.
 *
 * One new record moves the country totals, the vehicle mix, the hourly curve
 * and the summary all at once. Being clever about which keys to invalidate
 * would save a tiny bit of network and risk leaving one chart disagreeing with
 * the others. Invalidating everything keeps the dashboard consistent, which is
 * what matters here.
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
