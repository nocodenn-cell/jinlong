/** Origem pública do site (canonical, sitemap, Open Graph). Canônico: apex; www redireciona. */
export const DEFAULT_SITE_URL = 'https://jinlong.app'

export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_URL
}
