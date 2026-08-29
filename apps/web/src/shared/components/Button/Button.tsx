import type { ButtonHTMLAttributes } from 'react'
import './Button.css'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      // Default to type="button". HTML defaults to "submit", which would
      // make every button inside the record form submit it.
      type={type}
      className={`shared-button shared-button--${variant} ${className}`.trim()}
      {...props}
    />
  )
}
