/**
 * UI Tokens — Espaçamento semântico.
 * Fonte de verdade: `styles/tokens/semantic.css` (escalas component/layout/section).
 * Sem React — apenas referências `var()`.
 */

const v = (name: string): string => `var(${name})`

export const spacing = {
  component: {
    xs: v("--space-component-xs"),
    sm: v("--space-component-sm"),
    md: v("--space-component-md"),
    lg: v("--space-component-lg"),
    xl: v("--space-component-xl"),
  },
  layout: {
    xs: v("--space-layout-xs"),
    sm: v("--space-layout-sm"),
    md: v("--space-layout-md"),
    lg: v("--space-layout-lg"),
    xl: v("--space-layout-xl"),
    "2xl": v("--space-layout-2xl"),
  },
  section: {
    xs: v("--space-section-xs"),
    sm: v("--space-section-sm"),
    md: v("--space-section-md"),
    lg: v("--space-section-lg"),
    xl: v("--space-section-xl"),
  },
} as const

export type Spacing = typeof spacing
