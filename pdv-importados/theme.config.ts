/**
 * Layout Compiler — Theme Contract
 * --------------------------------------------------------------------------
 * Fase 0: tema claro único ("clássico").
 * Fase 2 · Onda 2: SSOT em styles/tokens/* (colors, spacing, radius, …).
 *
 * Tokens canônicos (consumo em componentes novos):
 *   --color-surface / --color-surface-soft
 *   --color-fg / --color-fg-muted / --color-fg-subtle
 *   --color-border
 *   --color-brand / --color-brand-strong
 *   --radius-control / --radius-card / --radius-panel
 *   --focus-ring-shadow
 *
 * Aliases legado (--accent, --jl-*, --fp-*) apontam para o SSOT via aliases.css.
 */

export const themes = {
  /** Tema claro — único ativo. */
  classico: true,
  /** Tema escuro — desativado (contrato). */
  noturno: false,
} as const

export type ThemeName = keyof typeof themes

/** Tema ativo e imutável do app. */
export const ACTIVE_THEME: ThemeName = 'classico'

export type ThemeConfig = typeof themes
