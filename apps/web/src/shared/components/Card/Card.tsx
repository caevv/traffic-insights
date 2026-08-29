import type { ReactNode } from 'react'
import './Card.css'

type CardProps = {
  title: string
  /** Short line under the title saying what you're looking at. */
  description?: string
  /** Chips, toggles, anything that acts on this card's content. */
  actions?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * The one panel component. Every section of the dashboard uses it, so heading
 * levels, padding and borders stay the same without each chart deciding for
 * itself.
 */
export function Card({
  title,
  description,
  actions,
  children,
  className = '',
}: CardProps) {
  return (
    <section className={`card ${className}`.trim()}>
      <header className="card__header">
        <div className="card__heading">
          <h2>{title}</h2>
          {description ? (
            <p className="card__description">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="card__actions">{actions}</div> : null}
      </header>
      <div className="card__body">{children}</div>
    </section>
  )
}
