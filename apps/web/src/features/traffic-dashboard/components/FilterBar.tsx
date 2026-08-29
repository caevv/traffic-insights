import { memo } from 'react'
import { Button } from '@/shared/components/Button'
import { ToggleChip } from '@/shared/components/ToggleChip'
import { RANGE_OPTIONS } from '../hooks/useDashboardFilters'
import { vehicleColor } from '../lib/palette'
import type { DashboardFilters, Reference } from '../types'
import './FilterBar.css'

type FilterBarProps = {
  filters: DashboardFilters
  reference: Reference
  isFiltered: boolean
  onRangeChange: (days: number | null) => void
  onToggleCountry: (code: string) => void
  onToggleVehicleType: (code: string) => void
  onReset: () => void
}

/**
 * All the filters in one place, as chips.
 *
 * Chips instead of <select multiple>. You can see what's selected at a glance
 * and remove it in one click. A multi-select hides all that in a scroll box.
 * Clicking the charts drives the same chips, so this bar also shows you what
 * the charts just did.
 */
export const FilterBar = memo(function FilterBar({
  filters,
  reference,
  isFiltered,
  onRangeChange,
  onToggleCountry,
  onToggleVehicleType,
  onReset,
}: FilterBarProps) {
  return (
    <div className="filter-bar">
      <fieldset className="filter-bar__group">
        <legend className="filter-bar__legend">Period</legend>
        <div className="filter-bar__chips">
          {RANGE_OPTIONS.map((option) => (
            <ToggleChip
              key={option.label}
              label={option.label}
              selected={filters.rangeDays === option.days}
              onToggle={() => onRangeChange(option.days)}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="filter-bar__group">
        <legend className="filter-bar__legend">Vehicle type</legend>
        <div className="filter-bar__chips">
          {reference.vehicleTypes.map((type) => (
            <ToggleChip
              key={type.code}
              label={type.label}
              color={vehicleColor(type.code)}
              selected={filters.vehicleTypes.includes(type.code)}
              onToggle={() => onToggleVehicleType(type.code)}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="filter-bar__group filter-bar__group--wide">
        <legend className="filter-bar__legend">
          Country
          {filters.countries.length > 0
            ? ` · ${filters.countries.length} selected`
            : ' · all'}
        </legend>
        <div className="filter-bar__chips">
          {reference.countries.map((country) => (
            <ToggleChip
              key={country.code}
              label={country.code}
              title={`${country.name}, ${country.region}`}
              selected={filters.countries.includes(country.code)}
              onToggle={() => onToggleCountry(country.code)}
            />
          ))}
        </div>
      </fieldset>

      <div className="filter-bar__reset">
        <Button variant="ghost" onClick={onReset} disabled={!isFiltered}>
          Reset filters
        </Button>
      </div>
    </div>
  )
})
