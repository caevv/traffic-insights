import { useCallback, useMemo, useState } from 'react'
import type { DashboardFilters } from '../types'

export const RANGE_OPTIONS = [
  { days: 1, label: '24 h' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: null, label: 'All time' },
] as const

const INITIAL_FILTERS: DashboardFilters = {
  rangeDays: 30,
  countries: [],
  vehicleTypes: [],
}

/** Add `value` if absent, remove it if present. Never mutates the input. */
function toggle(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value]
}

export type DashboardFilterControls = {
  filters: DashboardFilters
  isFiltered: boolean
  setRange: (days: number | null) => void
  toggleCountry: (code: string) => void
  toggleVehicleType: (code: string) => void
  reset: () => void
}

/**
 * Owns the dashboard's filter state and the only ways to change it.
 *
 * Every updater uses the functional form of `setState`. With cross-filtering,
 * two toggles can be dispatched from the same tick — clicking a bar while a
 * chip click is still queued — and the closure form would compute both from
 * the same stale snapshot, silently dropping one.
 *
 * The updaters are `useCallback`-stable so the memoised chart components below
 * are not re-rendered by a new function identity every time the parent
 * re-renders for an unrelated reason.
 */
export function useDashboardFilters(): DashboardFilterControls {
  const [filters, setFilters] = useState<DashboardFilters>(INITIAL_FILTERS)

  const setRange = useCallback((days: number | null) => {
    setFilters((current) => ({ ...current, rangeDays: days }))
  }, [])

  const toggleCountry = useCallback((code: string) => {
    setFilters((current) => ({
      ...current,
      countries: toggle(current.countries, code),
    }))
  }, [])

  const toggleVehicleType = useCallback((code: string) => {
    setFilters((current) => ({
      ...current,
      vehicleTypes: toggle(current.vehicleTypes, code),
    }))
  }, [])

  const reset = useCallback(() => setFilters(INITIAL_FILTERS), [])

  // Derived during render, not stored in state — storing it would let it drift
  // out of step with `filters` for exactly one render.
  const isFiltered =
    filters.countries.length > 0 ||
    filters.vehicleTypes.length > 0 ||
    filters.rangeDays !== INITIAL_FILTERS.rangeDays

  return useMemo(
    () => ({
      filters,
      isFiltered,
      setRange,
      toggleCountry,
      toggleVehicleType,
      reset,
    }),
    [filters, isFiltered, setRange, toggleCountry, toggleVehicleType, reset],
  )
}
