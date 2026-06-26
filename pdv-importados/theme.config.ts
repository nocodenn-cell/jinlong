/**
 * Layout Compiler — Theme Contract (Fase 0)
 * --------------------------------------------------------------------------
 * O tema NÃO é uma escolha do dev em runtime: é contrato.
 * O sistema é travado em um único tema claro ("clássico" / "cara de Bling").
 * O modo escuro (noturno / dragon-dark) foi aposentado na Fase 0.
 *
 * Tokens canônicos (definidos em styles/theme-oriental.css :root):
 *   --surface       superfície base (branco)
 *   --surface-soft  superfície secundária (slate-50)
 *   --surface-text  texto primário (slate-900)
 *   --border        divisores (slate-200)
 *   --accent        destaque (azul Bling #2563eb)
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
