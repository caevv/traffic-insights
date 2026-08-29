import './TooltipShell.css'

export type TooltipRow = {
  label: string
  value: string
  color?: string
}

type TooltipShellProps = {
  title: string
  rows: TooltipRow[]
  /** Optional hint about what clicking does, shown in a quieter style. */
  hint?: string
}

/**
 * Presentation for every chart tooltip in the dashboard.
 *
 * Defined at module scope — NOT inside a chart component. A component declared
 * inside another is a new component type on every render, which makes React
 * unmount and remount it constantly; for a tooltip that means it flickers and
 * loses its position as you move the pointer. Each chart wraps this in its own
 * small module-scope adapter that unpacks Recharts' payload.
 */
export function TooltipShell({ title, rows, hint }: TooltipShellProps) {
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__title">{title}</p>
      <dl className="chart-tooltip__rows">
        {rows.map((row) => (
          <div key={row.label} className="chart-tooltip__row">
            <dt>
              {row.color ? (
                <span
                  className="chart-tooltip__swatch"
                  style={{ background: row.color }}
                  aria-hidden="true"
                />
              ) : null}
              {row.label}
            </dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {hint ? <p className="chart-tooltip__hint">{hint}</p> : null}
    </div>
  )
}
