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

/** Add the value if it's missing, remove it if it's there. No mutation. */
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
 * Holds the dashboard filter state and the only ways to change it.
 *
 * Every updater uses the function form of setState. With cross-filtering, two
 * toggles can fire in the same tick, like clicking a bar while a chip click is
 * still queued. The closure form would work both out from the same old
 * snapshot and quietly drop one.
 *
 * The updaters are wrapped in useCallback so the memoised charts below don't
 * re-render just because the parent re-rendered for some unrelated reason.
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

  // Worked out during render, not kept in state. In state it could fall out
  // of step with `filters` for one render.
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
