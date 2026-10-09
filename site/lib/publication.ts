import type { SiteLocale } from './locales'

/**
 * Publicação da versão chinesa condicionada à revisão de falante nativo
 * com conhecimento do comércio brasileiro.
 *
 * - Produção só publica `zh-CN` com `NEXT_PUBLIC_SITE_ZH_REVIEWED=true`.
 * - Dev e Preview exibem a versão como rascunho (banner + noindex).
 */

type SiteEnv = Readonly<Record<string, string | undefined>>

export function isZhReviewed(env: SiteEnv = process.env): boolean {
  return env.NEXT_PUBLIC_SITE_ZH_REVIEWED === 'true'
}

export function isLocalePublic(locale: SiteLocale, env: SiteEnv = process.env): boolean {
  if (locale !== 'zh-CN') return true
  if (isZhReviewed(env)) return true
  return env.VERCEL_ENV !== 'production'
}

/** Rascunho = visível para revisão, mas fora dos buscadores. */
export function isLocaleDraft(locale: SiteLocale, env: SiteEnv = process.env): boolean {
  return locale === 'zh-CN' && !isZhReviewed(env)
}

/**
 * Trechos em chinês na página em português (linha-assinatura, chip bilíngue, painel
 * comparativo) são texto de marketing ainda sem revisão nativa: em produção só aparecem
 * depois da revisão. Nome do idioma e a marca 金龙 não são afetados.
 */
export function isDraftChineseVisible(env: SiteEnv = process.env): boolean {
  return isZhReviewed(env) || env.VERCEL_ENV !== 'production'
}
