import './ToggleChip.css'

type ToggleChipProps = {
  label: string
  selected: boolean
  onToggle: () => void
  /** Colours the dot so it matches the chart. */
  color?: string
  title?: string
}

/**
 * A filter chip.
 *
 * A real <button> with aria-pressed, not a styled div. So it's reachable with
 * Tab, works with Space and Enter, and screen readers say whether it's on. A
 * div with an onClick gives you none of that.
 */
export function ToggleChip({
  label,
  selected,
  onToggle,
  color,
  title,
}: ToggleChipProps) {
  return (
    <button
      type="button"
      className={`toggle-chip${selected ? ' toggle-chip--on' : ''}`}
      aria-pressed={selected}
      onClick={onToggle}
      title={title ?? label}
    >
      {color ? (
        <span
          className="toggle-chip__dot"
          style={{ background: color }}
          aria-hidden="true"
        />
      ) : null}
      {label}
    </button>
  )
}
