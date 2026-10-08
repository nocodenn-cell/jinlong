/**
 * Site comercial — locales públicos.
 * Isolado do ERP: o ERP usa os cookies `idioma_preferido` / `usuario_idioma` (pt | zh).
 * O site reutiliza `idioma_preferido` para lembrar a escolha do visitante.
 */

export const SITE_LOCALES = ['pt-BR', 'zh-CN'] as const

export type SiteLocale = (typeof SITE_LOCALES)[number]

export const DEFAULT_SITE_LOCALE: SiteLocale = 'pt-BR'

export const SITE_LOCALE_COOKIE = 'idioma_preferido'

const LEGACY_BY_LOCALE: Record<SiteLocale, 'pt' | 'zh'> = {
  'pt-BR': 'pt',
  'zh-CN': 'zh',
}

export function isSiteLocale(value: unknown): value is SiteLocale {
  return typeof value === 'string' && (SITE_LOCALES as readonly string[]).includes(value)
}

export function otherSiteLocale(locale: SiteLocale): SiteLocale {
  return locale === 'pt-BR' ? 'zh-CN' : 'pt-BR'
}

export function toLegacyIdioma(locale: SiteLocale): 'pt' | 'zh' {
  return LEGACY_BY_LOCALE[locale]
}

export function sitePath(locale: SiteLocale): string {
  return `/${locale}`
}
