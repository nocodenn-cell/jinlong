/**
 * Button Component — Onda 5, Lote 1
 *
 * Novo Button com design system unificado (design tokens).
 * Sem prop layoutVariant (Onda 3: colapso de dualismo).
 * Suporta sizes (sm, md, lg) e variants (primary, secondary, ghost, danger).
 *
 * Uso:
 * <Button>Click me</Button>
 * <Button size="lg" variant="primary">Large Button</Button>
 * <Button disabled>Disabled</Button>
 * <Button loading>Loading...</Button>
 */

import React from 'react'
import styles from './Button.module.css'
import type { ButtonSize, ButtonVariant } from '@/lib/design-tokens/button.tokens'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button size: sm (2rem), md (2.5rem), lg (3rem) */
  size?: ButtonSize
  /** Visual variant */
  variant?: ButtonVariant
  /** Disabled state */
  disabled?: boolean
  /** Loading state (shows opacity, disables interaction) */
  loading?: boolean
  /** Button content */
  children: React.ReactNode
}

export function Button({
  size = 'md',
  variant = 'primary',
  disabled = false,
  loading = false,
  children,
  className,
  ...props
}: ButtonProps) {
  const buttonClass = [
    styles.button,
    styles[size],
    styles[variant],
    disabled && styles.disabled,
    loading && styles.loading,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      className={buttonClass}
      disabled={disabled || loading}
      {...props}
    >
      {children}
    </button>
  )
}

Button.displayName = 'Button'

export default Button
