import { memo, useMemo } from 'react'
import {
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  type PieSectorDataItem,
} from 'recharts'
import { formatNumber, formatPercent, formatSpeed } from '@/shared/lib/format'
import { TooltipShell } from './TooltipShell'
import { vehicleColor } from '../lib/palette'
import type { VehicleTypeTraffic } from '../types'
import './VehicleMixChart.css'

const CHART_HEIGHT = 300

type VehicleSlice = VehicleTypeTraffic & { emphasis: number; color: string }

type VehicleTooltipProps = {
  active?: boolean
  payload?: { payload: VehicleSlice }[]
}

function VehicleTooltip({ active, payload }: VehicleTooltipProps) {
  const datum = payload?.[0]?.payload
  if (!active || !datum) return null

  return (
    <TooltipShell
      title={datum.label}
      rows={[
        {
          label: 'Share',
          value: formatPercent(datum.share),
          color: datum.color,
        },
        { label: 'Vehicles', value: formatNumber(datum.vehicleCount) },
        { label: 'Mean speed', value: formatSpeed(datum.avgSpeedKph) },
      ]}
      hint="Click the slice to filter by this vehicle type"
    />
  )
}

// Partial<...> because Recharts clones the element and fills in the geometry.
// None of it can be required where we write <VehicleSliceShape />.
type VehicleSliceShapeProps = Partial<PieSectorDataItem> & {
  payload?: VehicleSlice
}

/** Same as the bar chart: <Cell> is deprecated, so we use `shape`. */
function VehicleSliceShape({ payload, ...sector }: VehicleSliceShapeProps) {
  return (
    <Sector
      {...sector}
      fill={payload?.color ?? 'var(--series-1)'}
      fillOpacity={payload?.emphasis ?? 1}
      cursor="pointer"
    />
  )
}

type VehicleMixChartProps = {
  data: VehicleTypeTraffic[]
  selected: string[]
  onSelect: (vehicleType: string) => void
  /** Rendered in the hole of the donut. */
  totalLabel: string
}

/**
 * Vehicle type split. The second chart the task asks for.
 *
 * A donut, not a pie, because the hole isn't decoration. It holds the filtered
 * total, which is what every slice's share is relative to. Put that number
 * anywhere else and people have to go looking for it.
 *
 * Six slices is about as much as a pie can honestly show, so the exact shares
 * are in the tooltip and the legend too. Judging angles by eye stops working
 * past about three slices.
 */
export const VehicleMixChart = memo(function VehicleMixChart({
  data,
  selected,
  onSelect,
  totalLabel,
}: VehicleMixChartProps) {
  const slices = useMemo<VehicleSlice[]>(() => {
    const hasSelection = selected.length > 0
    return data.map((entry) => ({
      ...entry,
      color: vehicleColor(entry.vehicleType),
      emphasis:
        !hasSelection || selected.includes(entry.vehicleType) ? 1 : 0.28,
    }))
  }, [data, selected])

  return (
    <div className="vehicle-mix">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <PieChart>
          <Tooltip content={<VehicleTooltip />} />
          <Pie
            data={slices}
            dataKey="vehicleCount"
            nameKey="label"
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={2}
            stroke="var(--surface)"
            strokeWidth={2}
            shape={<VehicleSliceShape />}
            isAnimationActive={false}
            onClick={(item: PieSectorDataItem) => {
              const datum = item.payload as VehicleSlice | undefined
              if (datum) onSelect(datum.vehicleType)
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/*
        The centre label is a positioned DOM node, not an SVG <text>. It picks
        up the app's fonts and colours for free and stays readable at any size.
        pointer-events: none stops it eating clicks meant for the slices.
      */}
      <div className="vehicle-mix__center" aria-hidden="true">
        <span className="vehicle-mix__center-value">{totalLabel}</span>
        <span className="vehicle-mix__center-label">vehicles</span>
      </div>

      {/*
        A legend with the real percentages, not just colour keys. The weakness
        of a pie is that people can't read an angle, so printing the share next
        to the swatch takes the guesswork out. Each row is a button, so the
        legend is also a keyboard-friendly way to do the same filtering the
        slices do.
      */}
      <ul className="vehicle-mix__legend" aria-label="Vehicle type shares">
        {slices.map((slice) => (
          <li key={slice.vehicleType}>
            <button
              type="button"
              className="vehicle-mix__legend-item"
              aria-pressed={selected.includes(slice.vehicleType)}
              onClick={() => onSelect(slice.vehicleType)}
            >
              <span
                className="vehicle-mix__legend-dot"
                style={{ background: slice.color, opacity: slice.emphasis }}
                aria-hidden="true"
              />
              <span className="vehicle-mix__legend-label">{slice.label}</span>
              <span className="vehicle-mix__legend-share">
                {formatPercent(slice.share)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
})
