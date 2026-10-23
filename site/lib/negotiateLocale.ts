import { DEFAULT_SITE_LOCALE, type SiteLocale } from './locales'

interface NegotiationInput {
  /** Cookie `idioma_preferido` (pt | zh), gravado pelo seletor de idioma. */
  cookie: string | undefined
  acceptLanguage: string | null
  zhPublic: boolean
}

/** Escolha explícita do visitante (cookie) vence; sem ela, chinês (público principal). */
export function negotiateLocale({ cookie, zhPublic }: NegotiationInput): SiteLocale {
  if (!zhPublic) return DEFAULT_SITE_LOCALE
  if (cookie === 'zh') return 'zh-CN'
  if (cookie === 'pt') return 'pt-BR'
  // Público principal: comerciantes chineses. Sem escolha explícita, chinês é o padrão
  // (enquanto o zh estiver publicado; em produção depende da revisão nativa).
  return 'zh-CN'
}
