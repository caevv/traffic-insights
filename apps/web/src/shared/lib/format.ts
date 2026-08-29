/**
 * Formatters live at module level.
 *
 * Building an Intl.NumberFormat costs much more than calling format() on it.
 * Making one inside a chart tick callback would build a new formatter for
 * every tick on every render. Up here, each one is built once per page.
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

/** `1.2M`, for axis ticks where space is tight. */
export const formatCompact = (value: number): string =>
  compactNumber.format(value)

/** `1,234,567`, for tooltips and KPIs where the exact number is the point. */
export const formatNumber = (value: number): string => fullNumber.format(value)

export const formatPercent = (fraction: number): string =>
  percent.format(fraction)

export const formatSpeed = (kph: number): string =>
  `${oneDecimal.format(kph)} km/h`

export const formatTimestamp = (iso: string): string =>
  `${dateTime.format(new Date(iso))} UTC`

/** `07:00`, for hour-of-day axis labels. */
export const formatHour = (hour: number): string =>
  `${String(hour).padStart(2, '0')}:00`
