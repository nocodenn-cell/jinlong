import { DEFAULT_SITE_LOCALE, type SiteLocale } from './locales'

interface NegotiationInput {
  /** Cookie `idioma_preferido` (pt | zh), gravado pelo seletor de idioma. */
  cookie: string | undefined
  acceptLanguage: string | null
  zhPublic: boolean
}

function prefersChinese(acceptLanguage: string | null): boolean {
  const first = acceptLanguage?.split(',')[0]?.trim().toLowerCase() ?? ''
  return first.startsWith('zh')
}

/** Escolha explícita do visitante vence; depois, o idioma principal do navegador. */
export function negotiateLocale({ cookie, acceptLanguage, zhPublic }: NegotiationInput): SiteLocale {
  if (!zhPublic) return DEFAULT_SITE_LOCALE
  if (cookie === 'zh') return 'zh-CN'
  if (cookie === 'pt') return 'pt-BR'
  return prefersChinese(acceptLanguage) ? 'zh-CN' : DEFAULT_SITE_LOCALE
}
