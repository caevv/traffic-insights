import { memo } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  formatCompact,
  formatHour,
  formatNumber,
  formatSpeed,
} from '@/shared/lib/format'
import { TooltipShell } from './TooltipShell'
import type { HourlyTraffic } from '../types'

const CHART_HEIGHT = 300

/** Commuter windows, shaded to explain the twin peaks without a paragraph. */
const PEAK_WINDOWS = [
  { id: 'morning', from: 6.5, to: 9.5, label: 'Morning peak' },
  { id: 'evening', from: 16, to: 19, label: 'Evening peak' },
] as const

type HourlyTooltipProps = {
  active?: boolean
  payload?: { payload: HourlyTraffic }[]
}

function HourlyTooltip({ active, payload }: HourlyTooltipProps) {
  const datum = payload?.[0]?.payload
  if (!active || !datum) return null

  return (
    <TooltipShell
      title={`${formatHour(datum.hour)} local time`}
      rows={[
        {
          label: 'Vehicles',
          value: formatNumber(datum.vehicleCount),
          color: 'var(--series-1)',
        },
        {
          label: 'Mean speed',
          value: formatSpeed(datum.avgSpeedKph),
          color: 'var(--series-2)',
        },
      ]}
    />
  )
}

type HourlyRhythmChartProps = {
  data: HourlyTraffic[]
}

/**
 * Traffic rhythm by local hour of day — the third, exploratory graph.
 *
 * Two series on two axes, because the story is the RELATIONSHIP between them:
 * volume peaks at the commute, and mean speed dips in the same hours. Plotting
 * either alone shows a curve; plotting both shows congestion.
 *
 * The hour buckets come from `recorded_at AT TIME ZONE countries.timezone`, so
 * 08:00 in Berlin and 08:00 in Tokyo land in the same bucket. Bucketing by UTC
 * instead would smear sixteen rush hours across the day and flatten the very
 * shape this chart exists to show.
 */
export const HourlyRhythmChart = memo(function HourlyRhythmChart({
  data,
}: HourlyRhythmChartProps) {
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <ComposedChart
        data={data}
        margin={{ top: 8, right: 8, bottom: 4, left: 4 }}
      >
        <defs>
          <linearGradient id="hourly-volume-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.35} />
            <stop
              offset="100%"
              stopColor="var(--series-1)"
              stopOpacity={0.02}
            />
          </linearGradient>
        </defs>

        <CartesianGrid stroke="var(--grid-line)" vertical={false} />

        {PEAK_WINDOWS.map((window) => (
          <ReferenceArea
            key={window.id}
            x1={window.from}
            x2={window.to}
            yAxisId="volume"
            fill="var(--series-2)"
            fillOpacity={0.09}
            stroke="var(--series-2)"
            strokeOpacity={0.25}
            strokeDasharray="2 3"
            label={{
              value: window.label,
              position: 'insideTop',
              fill: 'var(--axis-text)',
              fontSize: 10,
            }}
          />
        ))}

        <XAxis
          dataKey="hour"
          type="number"
          domain={[0, 23]}
          ticks={[0, 3, 6, 9, 12, 15, 18, 21, 23]}
          tickFormatter={formatHour}
          tick={{ fill: 'var(--axis-text)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          yAxisId="volume"
          tickFormatter={formatCompact}
          tick={{ fill: 'var(--axis-text)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={46}
        />
        <YAxis
          yAxisId="speed"
          orientation="right"
          // A speed axis anchored at zero would compress the dip into a flat
          // line. `dataMin - 6` keeps the variation legible; the axis is
          // labelled in km/h so the non-zero baseline cannot mislead.
          domain={['dataMin - 6', 'dataMax + 6']}
          tickFormatter={(value: number) => `${Math.round(value)}`}
          tick={{ fill: 'var(--axis-text)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={34}
        />

        <Tooltip
          content={<HourlyTooltip />}
          cursor={{ stroke: 'var(--border-strong)', strokeDasharray: '3 3' }}
        />

        <Area
          yAxisId="volume"
          type="monotone"
          dataKey="vehicleCount"
          stroke="var(--series-1)"
          strokeWidth={2}
          fill="url(#hourly-volume-fill)"
          isAnimationActive={false}
        />
        <Line
          yAxisId="speed"
          type="monotone"
          dataKey="avgSpeedKph"
          stroke="var(--series-2)"
          strokeWidth={2}
          strokeDasharray="4 3"
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
})
