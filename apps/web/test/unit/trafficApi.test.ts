import { afterEach, describe, expect, it, vi } from 'vitest'
import { toQuery } from '@/features/traffic-dashboard/api/trafficApi'
import type { DashboardFilters } from '@/features/traffic-dashboard/types'

const NO_FILTERS: DashboardFilters = {
  rangeDays: null,
  countries: [],
  vehicleTypes: [],
}

describe('toQuery', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('produces an empty string when nothing is filtered', () => {
    expect(toQuery(NO_FILTERS)).toBe('')
  })

  it('joins selected codes with commas', () => {
    const query = toQuery({
      ...NO_FILTERS,
      countries: ['DE', 'FR'],
      vehicleTypes: ['car', 'truck'],
    })

    expect(query).toContain('countries=DE%2CFR')
    expect(query).toContain('vehicleTypes=car%2Ctruck')
  })

  it('omits `from` entirely for the all-time range', () => {
    expect(toQuery({ ...NO_FILTERS, rangeDays: null })).not.toContain('from=')
  })

  /**
   * The test that keeps the caching honest.
   *
   * A window start built from a raw Date.now() changes every render, so every
   * render would make a new URL. That's a miss in TanStack Query's cache and a
   * miss on the server's Cache-Control. Rounding down to the hour is what
   * makes both caches work.
   */
  describe('window start is snapped to the hour', () => {
    it('is stable across calls made at different minutes of the same hour', () => {
      vi.useFakeTimers()

      vi.setSystemTime(new Date('2024-06-10T14:00:31Z'))
      const atStartOfHour = toQuery({ ...NO_FILTERS, rangeDays: 7 })

      vi.setSystemTime(new Date('2024-06-10T14:59:59Z'))
      const nearEndOfHour = toQuery({ ...NO_FILTERS, rangeDays: 7 })

      expect(nearEndOfHour).toBe(atStartOfHour)
    })

    it('subtracts exactly the requested number of days', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-10T14:30:00Z'))

      const params = new URLSearchParams(
        toQuery({ ...NO_FILTERS, rangeDays: 7 }),
      )

      // 2024-06-10T14:00Z minus 7 days.
      expect(params.get('?from') ?? params.get('from')).toBe(
        '2024-06-03T14:00:00.000Z',
      )
    })

    it('changes once the clock crosses into the next hour', () => {
      vi.useFakeTimers()

      vi.setSystemTime(new Date('2024-06-10T14:59:59Z'))
      const beforeRollover = toQuery({ ...NO_FILTERS, rangeDays: 1 })

      vi.setSystemTime(new Date('2024-06-10T15:00:00Z'))
      const afterRollover = toQuery({ ...NO_FILTERS, rangeDays: 1 })

      expect(afterRollover).not.toBe(beforeRollover)
    })
  })
})
