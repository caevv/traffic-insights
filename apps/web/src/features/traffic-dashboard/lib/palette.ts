/**
 * Vehicle type colours, keyed by the code. Never by array index.
 *
 * The API sorts vehicle types by volume, so index-based colours would repaint
 * every slice whenever a filter changed the order. A legend whose colours move
 * around is worse than no legend.
 *
 * This sits in its own file so the chart file only exports components, which
 * is what keeps Vite's Fast Refresh working.
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
