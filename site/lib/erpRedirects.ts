/**
 * Compatibilidade de links antigos após a migração de domínios.
 * Quando ERP_REDIRECT_ORIGIN estiver definido (ex.: https://app.jinlong.app),
 * caminhos do ERP acessados em jinlong.app/www.jinlong.app são enviados ao ERP,
 * preservando caminho e query (307: mantém método e não fica em cache permanente).
 * Sem a variável, nada é redirecionado (inerte antes do corte).
 */
import { parseErpUrl } from './erpLinks'

type SiteEnv = Readonly<Record<string, string | undefined>>

export const ERP_PATH_PATTERNS = [
  '/login',
  '/auth/:path*',
  '/admin/:path*',
  '/gerente/:path*',
  '/caixa/:path*',
  '/api/:path*',
  '/demo-fluxo',
  '/privacidade',
  '/termos',
] as const

export interface SiteRedirect {
  source: string
  destination: string
  permanent: false
}

export function buildErpRedirects(env: SiteEnv = process.env): SiteRedirect[] {
  const origin = parseErpUrl(env.ERP_REDIRECT_ORIGIN)
  if (!origin) return []
  return ERP_PATH_PATTERNS.map((source) => ({
    source,
    destination: `${origin}${source}`,
    permanent: false,
  }))
}
