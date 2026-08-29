import './TooltipShell.css'

type TooltipRow = {
  label: string
  value: string
  color?: string
}

type TooltipShellProps = {
  title: string
  rows: TooltipRow[]
  /** Optional hint about what a click does, in a quieter style. */
  hint?: string
}

/**
 * How every chart tooltip looks.
 *
 * Declared at module level, NOT inside a chart component. A component declared
 * inside another one is a new component type on every render, so React keeps
 * unmounting and remounting it. For a tooltip that means it flickers and loses
 * its position as you move the mouse. Each chart wraps this in its own small
 * module-level adapter that unpacks the Recharts payload.
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
