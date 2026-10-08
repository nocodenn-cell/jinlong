import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ContactSection } from '@/components/site/ContactSection'
import { FeatureLedger } from '@/components/site/FeatureLedger'
import { HomeHero } from '@/components/site/HomeHero'
import { JourneySection } from '@/components/site/JourneySection'
import { SiteFooter } from '@/components/site/SiteFooter'
import { SiteHeader } from '@/components/site/SiteHeader'
import { getHomeContent } from '@/lib/site/content'
import { isSiteLocale, otherSiteLocale, sitePath, type SiteLocale } from '@/lib/site/locales'
import { isLocaleDraft, isLocalePublic, isZhReviewed } from '@/lib/site/publication'

interface HomePageProps {
  params: Promise<{ locale: string }>
}

function buildAlternates(locale: SiteLocale): Metadata['alternates'] {
  const alternates: Record<string, string> = { 'pt-BR': sitePath('pt-BR') }
  if (isZhReviewed()) alternates['zh-CN'] = sitePath('zh-CN')
  return { canonical: sitePath(locale), languages: alternates }
}

export async function generateMetadata({ params }: HomePageProps): Promise<Metadata> {
  const { locale } = await params
  if (!isSiteLocale(locale)) return {}
  const { meta } = getHomeContent(locale)
  return {
    title: { absolute: meta.title },
    description: meta.description,
    alternates: buildAlternates(locale),
    robots: isLocaleDraft(locale) ? { index: false, follow: false } : undefined,
    openGraph: {
      title: meta.title,
      description: meta.description,
      locale: locale.replace('-', '_'),
      type: 'website',
    },
  }
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params
  if (!isSiteLocale(locale)) notFound()

  const content = getHomeContent(locale)
  const showSwitch = isLocalePublic(otherSiteLocale(locale))

  return (
    <>
      {isLocaleDraft(locale) && (
        <p className="site-draft" role="note">
          {content.locale.draftBanner}
        </p>
      )}
      <SiteHeader locale={locale} content={content} showSwitch={showSwitch} />
      <main id="main-content">
        <HomeHero locale={locale} content={content} />
        <FeatureLedger content={content} />
        <JourneySection content={content} />
        <ContactSection locale={locale} content={content} />
      </main>
      <SiteFooter content={content} />
    </>
  )
}
