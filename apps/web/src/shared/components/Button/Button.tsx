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
      // Defaulting to type="button" rather than the HTML default of "submit"
      // stops every button inside the record form from submitting it.
      type={type}
      className={`shared-button shared-button--${variant} ${className}`.trim()}
      {...props}
    />
  )
}
