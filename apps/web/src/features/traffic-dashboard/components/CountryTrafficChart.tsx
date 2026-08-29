import { memo, useMemo } from 'react'
import {
  Bar,
  BarChart,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type BarRectangleItem,
} from 'recharts'
import { formatCompact, formatNumber, formatSpeed } from '@/shared/lib/format'
import { TooltipShell } from './TooltipShell'
import { tooltipDatum, type RechartsTooltipProps } from '../lib/tooltip'
import type { CountryTraffic } from '../types'

const CHART_HEIGHT = 420
const BAR_RADIUS: [number, number, number, number] = [0, 4, 4, 0]

/**
 * The API type plus one field for display.
 *
 * The per-bar opacity rides along IN THE DATA instead of in a closure. That's
 * what lets the shape renderer below sit at module level. A shape defined
 * inside the chart component would be a new component type every render, and
 * Recharts would remount every bar on every filter change.
 */
type CountryBar = CountryTraffic & { emphasis: number }

function CountryTooltip(props: RechartsTooltipProps<CountryBar>) {
  const datum = tooltipDatum(props)
  if (!datum) return null

  return (
    <TooltipShell
      title={`${datum.countryName} (${datum.countryCode})`}
      rows={[
        { label: 'Region', value: datum.region },
        { label: 'Vehicles', value: formatNumber(datum.vehicleCount) },
        { label: 'Mean speed', value: formatSpeed(datum.avgSpeedKph) },
      ]}
      hint="Click the bar to filter the dashboard to this country"
    />
  )
}

type CountryBarShapeProps = {
  x?: number
  y?: number
  width?: number
  height?: number
  payload?: CountryBar
}

/** Recharts 3 deprecated <Cell>. Per-row styling goes through `shape` now. */
function CountryBarShape({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  payload,
}: CountryBarShapeProps) {
  return (
    <Rectangle
      x={x}
      y={y}
      width={width}
      height={height}
      radius={BAR_RADIUS}
      fill="var(--series-1)"
      fillOpacity={payload?.emphasis ?? 1}
      cursor="pointer"
    />
  )
}

type CountryTrafficChartProps = {
  data: CountryTraffic[]
  /** Selected codes. Empty means no country filter. */
  selected: string[]
  onSelect: (countryCode: string) => void
}

/**
 * Country traffic. One of the two charts the task asks for.
 *
 * Horizontal bars, not vertical. With 16 countries, vertical bars mean tilted
 * labels, and comparing lengths from a shared baseline is the whole point of a
 * bar chart.
 *
 * Clicking a bar toggles that country in the filter, which is what makes this
 * a control and not just a picture.
 *
 * memo is worth it here. The parent re-renders whenever any other query
 * finishes, and rebuilding 16 SVG bar groups for a change this chart didn't
 * see is wasted work on every click.
 */
export const CountryTrafficChart = memo(function CountryTrafficChart({
  data,
  selected,
  onSelect,
}: CountryTrafficChartProps) {
  const bars = useMemo<CountryBar[]>(() => {
    const hasSelection = selected.length > 0
    return data.map((entry) => ({
      ...entry,
      // Unselected bars fade instead of vanishing. Keeping them on screen
      // keeps the sense of scale that makes the selected ones mean something.
      emphasis:
        !hasSelection || selected.includes(entry.countryCode) ? 1 : 0.26,
    }))
  }, [data, selected])

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart
        data={bars}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
        barCategoryGap="18%"
      >
        <XAxis
          type="number"
          tickFormatter={formatCompact}
          tick={{ fill: 'var(--axis-text)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="countryCode"
          width={38}
          tick={{ fill: 'var(--axis-text)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          content={<CountryTooltip />}
          cursor={{ fill: 'var(--surface-2)' }}
        />
        <Bar
          dataKey="vehicleCount"
          // Without a cap, filtering to one country turns its bar into a
          // 420px block. Recharts gives each category the full band, so fewer
          // categories means fatter bars. A max keeps the chart looking the
          // same with sixteen bars or one.
          maxBarSize={26}
          shape={<CountryBarShape />}
          isAnimationActive={false}
          onClick={(item: BarRectangleItem) => {
            const datum = item.payload as CountryBar | undefined
            if (datum) onSelect(datum.countryCode)
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  )
})
