/**
 * Formatters are module-level singletons.
 *
 * Constructing an `Intl.NumberFormat` is expensive — far more so than the
 * `format()` call itself. Creating one inside a chart tick callback would build
 * a new formatter for every tick on every render; hoisting them means each is
 * constructed exactly once for the life of the page.
 */

const compactNumber = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const fullNumber = new Intl.NumberFormat('en-US')

const percent = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 1,
})

const oneDecimal = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const dateTime = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
})

/** `1.2M` — for axis ticks, where horizontal space is the binding constraint. */
export const formatCompact = (value: number): string =>
  compactNumber.format(value)

/** `1,234,567` — for tooltips and KPIs, where the exact figure is the point. */
export const formatNumber = (value: number): string => fullNumber.format(value)

export const formatPercent = (fraction: number): string =>
  percent.format(fraction)

export const formatSpeed = (kph: number): string =>
  `${oneDecimal.format(kph)} km/h`

export const formatTimestamp = (iso: string): string =>
  `${dateTime.format(new Date(iso))} UTC`

/** `07:00` — hour-of-day axis labels. */
export const formatHour = (hour: number): string =>
  `${String(hour).padStart(2, '0')}:00`
