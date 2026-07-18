/**
 * Design Tokens — Button Component
 * Onda 5, Lote 1: Button com design system unificado
 *
 * Uso: const buttonTokens = buttonTokens.sizes.md → { padding, fontSize, height }
 */

export const buttonTokens = {
  sizes: {
    sm: {
      padding: '0.5rem 1rem',
      fontSize: '0.875rem',
      height: '2rem',
      lineHeight: '1.25',
    },
    md: {
      padding: '0.75rem 1.5rem',
      fontSize: '1rem',
      height: '2.5rem',
      lineHeight: '1.5',
    },
    lg: {
      padding: '1rem 2rem',
      fontSize: '1.125rem',
      height: '3rem',
      lineHeight: '1.5',
    },
  },

  variants: {
    primary: {
      bg: 'var(--color-primary)',
      text: 'var(--color-white)',
      border: 'none',
      hover: 'var(--color-primary-dark)',
      active: 'var(--color-primary-darker)',
    },
    secondary: {
      bg: 'var(--color-secondary)',
      text: 'var(--color-white)',
      border: 'none',
      hover: 'var(--color-secondary-dark)',
      active: 'var(--color-secondary-darker)',
    },
    ghost: {
      bg: 'transparent',
      text: 'var(--color-text)',
      border: '1px solid var(--color-border)',
      hover: 'var(--color-bg-hover)',
      active: 'var(--color-bg-active)',
    },
    danger: {
      bg: 'var(--color-error)',
      text: 'var(--color-white)',
      border: 'none',
      hover: 'var(--color-error-dark)',
      active: 'var(--color-error-darker)',
    },
  },

  states: {
    disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
      pointerEvents: 'none',
    },
    loading: {
      opacity: 0.7,
      cursor: 'wait',
    },
  },

  common: {
    borderRadius: 'var(--radius-md)',
    fontWeight: 'var(--font-weight-medium)',
    transition: 'all 0.2s ease',
    fontFamily: 'var(--font-family-sans)',
  },
}

export type ButtonSize = keyof typeof buttonTokens.sizes
export type ButtonVariant = keyof typeof buttonTokens.variants
