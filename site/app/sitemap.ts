import type { MetadataRoute } from 'next'
import { SITE_LOCALES, sitePath } from '@/lib/locales'
import { isLocaleDraft, isLocalePublic } from '@/lib/publication'
import { SIMULADOR_SLUG } from '@/lib/simuladorHibrido.copy'
import { getSiteUrl } from '@/lib/siteUrl'

/** Só idiomas publicados e revisados entram no sitemap. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl()
  return SITE_LOCALES.filter((locale) => isLocalePublic(locale) && !isLocaleDraft(locale)).flatMap(
    (locale): MetadataRoute.Sitemap => [
      { url: `${base}${sitePath(locale)}`, changeFrequency: 'monthly', priority: 1 },
      { url: `${base}${sitePath(locale)}/${SIMULADOR_SLUG}`, changeFrequency: 'monthly', priority: 0.8 },
    ]
  )
}
