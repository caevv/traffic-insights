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

// `Partial<...>`: Recharts clones the element and injects the geometry, so
// none of it can be required at the point where `<VehicleSliceShape />` is
// written.
type VehicleSliceShapeProps = Partial<PieSectorDataItem> & {
  payload?: VehicleSlice
}

/** Replaces the deprecated `<Cell>`, same as the bar chart. */
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
 * Vehicle type distribution — the second required graph.
 *
 * A donut rather than a full pie, because the hole is not decoration: it holds
 * the filtered total, which is the context every slice's share is relative to.
 * Put that number anywhere else and the reader has to hunt for it.
 *
 * Six categories is about the upper bound of what a pie can honestly convey,
 * so the exact shares also appear in the tooltip and the legend — judging
 * angles by eye stops being reliable past roughly three slices.
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
        The centre label is a positioned DOM node rather than an SVG <text>:
        it inherits the app's font stack and colour tokens for free, and stays
        legible at any container size. `pointer-events: none` keeps it from
        swallowing clicks meant for the slices behind it.
      */}
      <div className="vehicle-mix__center" aria-hidden="true">
        <span className="vehicle-mix__center-value">{totalLabel}</span>
        <span className="vehicle-mix__center-label">vehicles</span>
      </div>

      {/*
        A legend carrying the actual percentages, not just colour keys. The
        whole weakness of a pie is that people cannot read an angle; printing
        the share next to the swatch removes the guesswork the shape imposes.
        Each row is a button, so the legend is a second, keyboard-reachable
        route to the same cross-filter the slices provide.
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
