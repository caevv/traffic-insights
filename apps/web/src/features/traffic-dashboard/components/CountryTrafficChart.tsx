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
import type { CountryTraffic } from '../types'

const CHART_HEIGHT = 420
const BAR_RADIUS: [number, number, number, number] = [0, 4, 4, 0]

/**
 * View model: the wire type plus one presentational field.
 *
 * The per-bar opacity travels IN THE DATA rather than through a closure. That
 * is what lets the shape renderer below live at module scope — a shape defined
 * inside the chart component would be a new component type on every render,
 * and Recharts would remount every bar on every keystroke of a filter.
 */
type CountryBar = CountryTraffic & { emphasis: number }

type CountryTooltipProps = {
  active?: boolean
  payload?: { payload: CountryBar }[]
}

function CountryTooltip({ active, payload }: CountryTooltipProps) {
  const datum = payload?.[0]?.payload
  if (!active || !datum) return null

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

/** Replaces the deprecated `<Cell>`: Recharts 3 customises per-datum via `shape`. */
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
  /** Codes currently selected. Empty means "no country filter applied". */
  selected: string[]
  onSelect: (countryCode: string) => void
}

/**
 * Country-wise traffic volume — one of the two required graphs.
 *
 * Horizontal bars rather than vertical: with 16 countries, vertical bars force
 * rotated labels, and comparing bar lengths against a common baseline is the
 * entire reason to use a bar chart.
 *
 * Clicking a bar toggles that country in the dashboard-wide filter, which is
 * what makes this a control rather than a picture.
 *
 * `memo` earns its place here: the parent re-renders whenever ANY sibling
 * query settles, and rebuilding 16 SVG bar groups for a change this chart's
 * props did not reflect is wasted work on every interaction.
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
      // Unselected bars fade rather than disappear: keeping them on screen
      // preserves the sense of scale that makes the selected ones meaningful.
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
          // Without a cap, filtering down to one country turns its bar into a
          // 420px-tall block: Recharts gives each category the full band, so
          // fewer categories means fatter bars. A ceiling keeps the chart
          // looking the same whether it shows sixteen bars or one.
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
