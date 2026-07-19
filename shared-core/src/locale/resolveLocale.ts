import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  type AppLocale,
  type LegacyIdioma,
} from './types'

function isAppLocale(value: string): value is AppLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

/**
 * Bridge legado → BCP 47 (sem alterar DB).
 * `pt` → `pt-BR`, `zh` / `zh-HK` → `zh-CN`.
 */
export function bridgeLegacyIdioma(idioma: unknown): AppLocale {
  if (idioma === 'zh' || idioma === 'zh-HK' || idioma === 'zh-CN') return 'zh-CN'
  if (idioma === 'pt' || idioma === 'pt-BR') return 'pt-BR'
  return DEFAULT_LOCALE
}

/**
 * BCP 47 → tag curta para APIs legadas (`getMessages`, toggle).
 * `en-US` ainda não tem catálogo legado → mapeia para `pt` (mensagens PT até 5.2c+).
 */
export function toLegacyIdioma(locale: AppLocale): LegacyIdioma {
  if (locale === 'zh-CN') return 'zh'
  return 'pt'
}

/**
 * Resolve qualquer input (legado, BCP 47, lixo) para `AppLocale`.
 * Desconhecido → `pt-BR`.
 */
export function resolveLocale(input: unknown): AppLocale {
  if (typeof input !== 'string' || !input.trim()) return FALLBACK_LOCALE

  const raw = input.trim()
  if (isAppLocale(raw)) return raw

  const lower = raw.toLowerCase()
  if (lower === 'en' || lower === 'en-us') return 'en-US'
  if (lower === 'zh' || lower.startsWith('zh-')) return 'zh-CN'
  if (lower === 'pt' || lower.startsWith('pt-')) return 'pt-BR'

  return bridgeLegacyIdioma(raw)
}
