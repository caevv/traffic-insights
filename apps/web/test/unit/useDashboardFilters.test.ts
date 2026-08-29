import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDashboardFilters } from '@/features/traffic-dashboard/hooks/useDashboardFilters'

describe('useDashboardFilters', () => {
  it('starts on the 30-day window with no dimension filters', () => {
    const { result } = renderHook(() => useDashboardFilters())

    expect(result.current.filters).toEqual({
      rangeDays: 30,
      countries: [],
      vehicleTypes: [],
    })
    expect(result.current.isFiltered).toBe(false)
  })

  it('toggles a country on and back off', () => {
    const { result } = renderHook(() => useDashboardFilters())

    act(() => result.current.toggleCountry('DE'))
    expect(result.current.filters.countries).toEqual(['DE'])
    expect(result.current.isFiltered).toBe(true)

    act(() => result.current.toggleCountry('DE'))
    expect(result.current.filters.countries).toEqual([])
    expect(result.current.isFiltered).toBe(false)
  })

  /**
   * Cross-filtering means a chip click and a chart click can land in the same
   * tick. The functional form of `setState` is what stops the second update
   * from being computed against the first one's stale snapshot — with a
   * closure over `filters`, one of these two toggles would silently vanish.
   */
  it('keeps both updates when two toggles happen in the same tick', () => {
    const { result } = renderHook(() => useDashboardFilters())

    act(() => {
      result.current.toggleCountry('DE')
      result.current.toggleCountry('FR')
    })

    expect(result.current.filters.countries).toEqual(['DE', 'FR'])
  })

  it('does not mutate the previous filter arrays', () => {
    const { result } = renderHook(() => useDashboardFilters())
    const before = result.current.filters.countries

    act(() => result.current.toggleCountry('DE'))

    expect(before).toEqual([])
    expect(result.current.filters.countries).not.toBe(before)
  })

  it('treats a changed range as a filter', () => {
    const { result } = renderHook(() => useDashboardFilters())

    act(() => result.current.setRange(7))

    expect(result.current.filters.rangeDays).toBe(7)
    expect(result.current.isFiltered).toBe(true)
  })

  it('reset returns every dimension to its initial value', () => {
    const { result } = renderHook(() => useDashboardFilters())

    act(() => {
      result.current.setRange(1)
      result.current.toggleCountry('DE')
      result.current.toggleVehicleType('truck')
    })
    expect(result.current.isFiltered).toBe(true)

    act(() => result.current.reset())

    expect(result.current.filters).toEqual({
      rangeDays: 30,
      countries: [],
      vehicleTypes: [],
    })
    expect(result.current.isFiltered).toBe(false)
  })

  it('keeps updater identities stable so memoised charts are not re-rendered', () => {
    const { result } = renderHook(() => useDashboardFilters())
    const firstToggle = result.current.toggleCountry

    act(() => result.current.setRange(7))

    expect(result.current.toggleCountry).toBe(firstToggle)
  })
})
