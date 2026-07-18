/**
 * Locales de UI (BCP 47) — Missão 5.2b / ADR-005 §6.
 * Idioma legado da app continua `pt` | `zh` na borda até migração.
 */

/** Locales suportados pelo núcleo. */
export type AppLocale = 'pt-BR' | 'zh-CN' | 'en-US'

/** Preferência curta persistida hoje (`usuarios.idioma_preferido`). */
export type LegacyIdioma = 'pt' | 'zh'

export const DEFAULT_LOCALE: AppLocale = 'pt-BR'

export const SUPPORTED_LOCALES: readonly AppLocale[] = [
  'pt-BR',
  'zh-CN',
  'en-US',
] as const

/** Fallback de catálogo / formatação quando o locale pedido não resolve. */
export const FALLBACK_LOCALE: AppLocale = 'pt-BR'
