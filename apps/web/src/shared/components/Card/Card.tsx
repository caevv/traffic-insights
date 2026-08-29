import type { ReactNode } from 'react'
import './Card.css'

type CardProps = {
  title: string
  /** Short line under the title explaining what the reader is looking at. */
  description?: string
  /** Filter chips, toggles — anything that acts on this card's content. */
  actions?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * The single panel primitive. Every section of the dashboard is one of these,
 * so heading levels, padding and borders stay consistent without each chart
 * re-deciding them.
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
