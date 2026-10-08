/** Origem pública do site (canonical, sitemap, Open Graph). */
export const DEFAULT_SITE_URL = 'https://www.jinlong.app'

export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_URL
}
