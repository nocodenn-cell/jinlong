/**
 * UI Tokens — Tipografia semântica.
 * Fonte de verdade: `styles/tokens/semantic.css` e `base.css`.
 * Sem React — apenas referências `var()`.
 */

const v = (name: string): string => `var(${name})`

export const typography = {
  size: {
    heading: {
      xs: v("--font-size-heading-xs"),
      sm: v("--font-size-heading-sm"),
      md: v("--font-size-heading-md"),
      lg: v("--font-size-heading-lg"),
      xl: v("--font-size-heading-xl"),
      "2xl": v("--font-size-heading-2xl"),
      "3xl": v("--font-size-heading-3xl"),
    },
    body: {
      xs: v("--font-size-body-xs"),
      sm: v("--font-size-body-sm"),
      md: v("--font-size-body-md"),
      lg: v("--font-size-body-lg"),
    },
    caption: v("--font-size-caption"),
    label: v("--font-size-label"),
    button: v("--font-size-button"),
  },
  weight: {
    heading: v("--font-weight-heading"),
    body: v("--font-weight-body"),
    emphasis: v("--font-weight-emphasis"),
    strong: v("--font-weight-strong"),
  },
  lineHeight: {
    tight: v("--line-height-tight"),
    normal: v("--line-height-normal"),
    relaxed: v("--line-height-relaxed"),
  },
} as const

export type Typography = typeof typography
