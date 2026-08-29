/**
 * Vehicle type colours, keyed by the type's own code — never by array index.
 *
 * The API orders vehicle types by volume, so an index-based palette would
 * repaint every slice whenever a filter changed the ranking. A legend whose
 * colours move under the reader is worse than no legend at all.
 *
 * This lives in its own module rather than beside the chart so the chart file
 * exports components only, which is what keeps Vite's Fast Refresh working.
 */
const VEHICLE_COLORS: Record<string, string> = {
  car: 'var(--series-1)',
  truck: 'var(--series-2)',
  motorcycle: 'var(--series-3)',
  van: 'var(--series-4)',
  bus: 'var(--series-5)',
  bicycle: 'var(--series-6)',
}

export const vehicleColor = (code: string): string =>
  VEHICLE_COLORS[code] ?? 'var(--series-1)'
