/**
 * UI Tokens — Border radius semântico.
 * Fonte de verdade: `styles/tokens/semantic.css`.
 * Sem React — apenas referências `var()`.
 */

const v = (name: string): string => `var(${name})`

export const radius = {
  component: {
    sm: v("--radius-component-sm"),
    md: v("--radius-component-md"),
    lg: v("--radius-component-lg"),
    xl: v("--radius-component-xl"),
  },
  button: {
    sm: v("--radius-button-sm"),
    md: v("--radius-button-md"),
    lg: v("--radius-button-lg"),
    full: v("--radius-button-full"),
  },
  card: v("--radius-card"),
  modal: v("--radius-modal"),
  tooltip: v("--radius-tooltip"),
} as const

export type Radius = typeof radius
