import { memo } from 'react'
import { formatNumber, formatSpeed, formatTimestamp } from '@/shared/lib/format'
import type { TrafficSummary } from '../types'
import './SummaryStrip.css'

type KpiCardProps = {
  label: string
  value: string
  /** Second line: where the number comes from, or what it covers. */
  detail?: string
  accent?: string
}

/** Module level, not nested. One component type, used four times. */
function KpiCard({ label, value, detail, accent }: KpiCardProps) {
  return (
    <div
      className="kpi"
      style={accent ? { borderTopColor: accent } : undefined}
    >
      <p className="kpi__label">{label}</p>
      <p className="kpi__value">{value}</p>
      {detail ? <p className="kpi__detail">{detail}</p> : null}
    </div>
  )
}

type SummaryStripProps = {
  summary: TrafficSummary
}

export const SummaryStrip = memo(function SummaryStrip({
  summary,
}: SummaryStripProps) {
  const coverage =
    summary.firstRecordedAt && summary.lastRecordedAt
      ? `${formatTimestamp(summary.firstRecordedAt)} → ${formatTimestamp(
          summary.lastRecordedAt,
        )}`
      : 'No records in range'

  return (
    <div className="kpi-strip">
      <KpiCard
        label="Total vehicles"
        value={formatNumber(summary.totalVehicles)}
        detail="Sum over the selected window"
        accent="var(--series-1)"
      />
      <KpiCard
        label="Mean speed"
        value={formatSpeed(summary.avgSpeedKph)}
        // Worth saying. A plain average of hourly averages gives a clearly
        // different, and wrong, number.
        detail="Weighted by vehicle count"
        accent="var(--series-2)"
      />
      <KpiCard
        label="Countries"
        value={formatNumber(summary.countryCount)}
        detail="With data in range"
        accent="var(--series-3)"
      />
      <KpiCard
        label="Hourly observations"
        value={formatNumber(summary.recordCount)}
        detail={coverage}
        accent="var(--series-5)"
      />
    </div>
  )
})
