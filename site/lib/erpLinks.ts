/**
 * Endereço público do ERP. O site só cria links para ele (nunca chama APIs).
 * Hoje o ERP responde em www.jinlong.app; após a migração de domínios,
 * NEXT_PUBLIC_ERP_URL passa a ser https://app.jinlong.app.
 */

type SiteEnv = Readonly<Record<string, string | undefined>>

export const CURRENT_ERP_URL = 'https://www.jinlong.app'

const LOCAL_HTTP = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

export function parseErpUrl(raw: string | undefined): string | null {
  const value = raw?.trim().replace(/\/+$/, '')
  if (!value) return null
  try {
    const url = new URL(value)
    const valid = url.protocol === 'https:' || LOCAL_HTTP.test(url.origin)
    return valid && url.pathname === '/' && !url.search ? url.origin : null
  } catch {
    return null
  }
}

export function getErpUrl(env: SiteEnv = process.env): string {
  return parseErpUrl(env.NEXT_PUBLIC_ERP_URL) ?? CURRENT_ERP_URL
}

export function erpHref(path: `/${string}`, env: SiteEnv = process.env): string {
  return `${getErpUrl(env)}${path}`
}
