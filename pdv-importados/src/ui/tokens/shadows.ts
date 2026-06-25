/**
 * UI Tokens — Sombras semânticas.
 * Fonte de verdade: `styles/tokens/semantic.css`.
 * Sem React — apenas referências `var()`.
 */

const v = (name: string): string => `var(${name})`

export const shadows = {
  component: {
    sm: v("--shadow-component-sm"),
    md: v("--shadow-component-md"),
    lg: v("--shadow-component-lg"),
  },
  floating: {
    sm: v("--shadow-floating-sm"),
    md: v("--shadow-floating-md"),
    lg: v("--shadow-floating-lg"),
    xl: v("--shadow-floating-xl"),
  },
  modal: v("--shadow-modal"),
  dropdown: v("--shadow-dropdown"),
  tooltip: v("--shadow-tooltip"),
} as const

export type Shadows = typeof shadows
