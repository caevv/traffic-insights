import './ToggleChip.css'

type ToggleChipProps = {
  label: string
  selected: boolean
  onToggle: () => void
  /** Paints the chip's dot, tying it to the colour it has in the charts. */
  color?: string
  title?: string
}

/**
 * A filter chip.
 *
 * Rendered as a real `<button>` with `aria-pressed` rather than a styled `div`,
 * so it is reachable by Tab, operable with Space and Enter, and announced with
 * its on/off state — none of which a `div` with an onClick gives you.
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
