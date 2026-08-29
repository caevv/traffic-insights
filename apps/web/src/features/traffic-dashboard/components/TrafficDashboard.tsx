import { useDeferredValue } from 'react'
import { Card } from '@/shared/components/Card'
import { QueryState } from '@/shared/components/QueryState'
import { formatCompact, formatTimestamp } from '@/shared/lib/format'
import {
  useReference,
  useRecordMutations,
  useSummary,
  useTrafficByCountry,
  useTrafficByHour,
  useTrafficByVehicleType,
  useTrafficRecords,
} from '../api/queries'
import { useDashboardFilters } from '../hooks/useDashboardFilters'
import { CountryTrafficChart } from './CountryTrafficChart'
import { FilterBar } from './FilterBar'
import { HourlyRhythmChart } from './HourlyRhythmChart'
import { RecordsPanel } from './RecordsPanel'
import { SummaryStrip } from './SummaryStrip'
import { VehicleMixChart } from './VehicleMixChart'

/** Enough rows to show the write path working, few enough to stay scannable. */
const RECORD_ROWS = 8

export function TrafficDashboard() {
  const {
    filters,
    isFiltered,
    setRange,
    toggleCountry,
    toggleVehicleType,
    reset,
  } = useDashboardFilters()

  /**
   * Queries read the DEFERRED filters, the filter bar reads the live ones.
   *
   * Clicking three country chips in quick succession would otherwise fire
   * three rounds of five queries and re-render four charts between each. With
   * the deferred value, the chips respond instantly while React coalesces the
   * expensive work, and `isStale` dims the charts so the reader can see the
   * numbers on screen are one step behind their input.
   */
  const deferredFilters = useDeferredValue(filters)
  const isStale = filters !== deferredFilters

  const reference = useReference()
  const summary = useSummary(deferredFilters)
  const byCountry = useTrafficByCountry(deferredFilters)
  const byVehicleType = useTrafficByVehicleType(deferredFilters)
  const byHour = useTrafficByHour(deferredFilters)
  const records = useTrafficRecords(deferredFilters, RECORD_ROWS)
  const mutations = useRecordMutations()

  if (reference.isPending || reference.isError || !reference.data) {
    return (
      <main className="app">
        <QueryState
          isPending={reference.isPending}
          error={reference.error}
          height={360}
          onRetry={() => void reference.refetch()}
        >
          {null}
        </QueryState>
      </main>
    )
  }

  const dataRange = reference.data.range
  const coverage =
    dataRange.from && dataRange.to
      ? `${formatTimestamp(dataRange.from)} → ${formatTimestamp(dataRange.to)}`
      : 'No data loaded'

  return (
    <main className="app">
      <header className="app-header">
        <div className="app-header__title">
          <span className="app-header__mark" aria-hidden="true">
            TI
          </span>
          <div>
            <h1>Traffic Insights</h1>
            <p className="app-header__meta">
              Hourly vehicle counts across {reference.data.countries.length}{' '}
              countries
            </p>
          </div>
        </div>
        <p className="app-header__meta">Dataset covers {coverage}</p>
      </header>

      <FilterBar
        filters={filters}
        reference={reference.data}
        isFiltered={isFiltered}
        onRangeChange={setRange}
        onToggleCountry={toggleCountry}
        onToggleVehicleType={toggleVehicleType}
        onReset={reset}
      />

      <div className={isStale ? 'is-stale' : undefined}>
        <QueryState
          isPending={summary.isPending}
          error={summary.error}
          height={104}
          onRetry={() => void summary.refetch()}
        >
          {summary.data ? <SummaryStrip summary={summary.data} /> : null}
        </QueryState>
      </div>

      <div className={`chart-grid${isStale ? ' is-stale' : ''}`}>
        <Card
          title="Country-wise traffic"
          description="Total vehicles per country. Click a bar to filter."
        >
          <QueryState
            isPending={byCountry.isPending}
            error={byCountry.error}
            isEmpty={byCountry.data?.length === 0}
            height={420}
            onRetry={() => void byCountry.refetch()}
          >
            <CountryTrafficChart
              data={byCountry.data ?? []}
              selected={filters.countries}
              onSelect={toggleCountry}
            />
          </QueryState>
        </Card>

        <Card
          title="Vehicle type distribution"
          description="Share of total volume. Click a slice to filter."
        >
          <QueryState
            isPending={byVehicleType.isPending}
            error={byVehicleType.error}
            isEmpty={byVehicleType.data?.length === 0}
            height={300}
            onRetry={() => void byVehicleType.refetch()}
          >
            <VehicleMixChart
              data={byVehicleType.data ?? []}
              selected={filters.vehicleTypes}
              onSelect={toggleVehicleType}
              totalLabel={formatCompact(summary.data?.totalVehicles ?? 0)}
            />
          </QueryState>
        </Card>

        <Card
          className="chart-grid__full"
          title="Traffic rhythm by local hour"
          description="Volume against mean speed, bucketed by each country's own local time — congestion is the gap between the two curves."
        >
          <QueryState
            isPending={byHour.isPending}
            error={byHour.error}
            isEmpty={byHour.data?.length === 0}
            height={300}
            onRetry={() => void byHour.refetch()}
          >
            <HourlyRhythmChart data={byHour.data ?? []} />
          </QueryState>
        </Card>
      </div>

      <Card
        title="Observations"
        description="Add, edit or remove a record — every chart above re-reads from the database when you do."
      >
        <QueryState
          isPending={records.isPending}
          error={records.error}
          height={320}
          onRetry={() => void records.refetch()}
        >
          {records.data ? (
            <RecordsPanel
              records={records.data.items}
              total={records.data.total}
              reference={reference.data}
              mutations={mutations}
            />
          ) : null}
        </QueryState>
      </Card>

      <footer className="app-footer">
        <span>
          Aggregates computed in PostgreSQL — one GROUP BY per chart, never in
          the browser.
        </span>
        <a href="/docs" target="_blank" rel="noreferrer">
          API documentation →
        </a>
      </footer>
    </main>
  )
}
