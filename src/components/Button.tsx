import { forwardRef, type ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'filled' | 'tinted' | 'plain' | 'danger'
type ButtonSize = 'sm' | 'md' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'ios-button-sm',
  md: 'ios-button-md',
  icon: 'ios-button-icon',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'plain', size = 'md', className = '', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`ios-button ios-button-${variant} ${SIZE_CLASS[size]} ${className}`}
      {...props}
    />
  )
})
