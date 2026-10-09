import type { MetadataRoute } from 'next'
import { SITE_LOCALES, sitePath } from '@/lib/locales'
import { isLocaleDraft, isLocalePublic } from '@/lib/publication'
import { getSiteUrl } from '@/lib/siteUrl'

/** Só idiomas publicados e revisados entram no sitemap. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl()
  return SITE_LOCALES.filter((locale) => isLocalePublic(locale) && !isLocaleDraft(locale)).map(
    (locale) => ({ url: `${base}${sitePath(locale)}`, changeFrequency: 'monthly', priority: 1 })
  )
}
