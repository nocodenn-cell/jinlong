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
  has?: Array<{ type: 'host'; value: string }>
}

/**
 * www → apex do site (ex.: www.jinlong.app/x → jinlong.app/x), preservando caminho e query.
 * Só atua quando o site recebe o host www; antes do corte o www pertence ao ERP e isto fica inerte.
 * Deve vir depois dos redirecionamentos do ERP para que www/login vá direto ao ERP (um salto só).
 */
export function buildWwwToApexRedirect(siteUrl: string): SiteRedirect[] {
  let url: URL
  try {
    url = new URL(siteUrl)
  } catch {
    return []
  }
  if (url.protocol !== 'https:' || url.hostname.startsWith('www.') || !url.hostname.includes('.')) return []
  return [
    {
      source: '/:path*',
      has: [{ type: 'host', value: `www.${url.hostname}` }],
      destination: `${url.origin}/:path*`,
      permanent: false,
    },
  ]
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
