import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ContactFab } from '@/components/ContactFab'
import { Difference } from '@/components/Difference'
import { Faq } from '@/components/Faq'
import { FinalCta } from '@/components/FinalCta'
import { Hero } from '@/components/Hero'
import { Journey } from '@/components/Journey'
import { NextStep } from '@/components/NextStep'
import { Showcase } from '@/components/Showcase'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { Statement } from '@/components/Statement'
import { getHomeContent } from '@/lib/content'
import { SEO_KEYWORDS } from '@/lib/siteConfig'
import { getSiteUrl } from '@/lib/siteUrl'
import { isSiteLocale, otherSiteLocale, sitePath, type SiteLocale } from '@/lib/locales'
import { isLocaleDraft, isLocalePublic, isZhReviewed } from '@/lib/publication'

interface HomePageProps {
  params: Promise<{ locale: string }>
}

function buildAlternates(locale: SiteLocale): Metadata['alternates'] {
  const languages: Record<string, string> = { 'pt-BR': sitePath('pt-BR') }
  if (isZhReviewed()) {
    languages['zh-CN'] = sitePath('zh-CN')
    languages['x-default'] = sitePath('zh-CN')
  }
  return { canonical: sitePath(locale), languages }
}

export async function generateMetadata({ params }: HomePageProps): Promise<Metadata> {
  const { locale } = await params
  if (!isSiteLocale(locale)) return {}
  const { meta } = getHomeContent(locale)
  return {
    title: { absolute: meta.title },
    description: meta.description,
    keywords: [...SEO_KEYWORDS[locale]],
    alternates: buildAlternates(locale),
    robots: isLocaleDraft(locale) ? { index: false, follow: false } : undefined,
    openGraph: {
      title: meta.title,
      description: meta.description,
      locale: locale.replace('-', '_'),
      type: 'website',
      url: sitePath(locale),
      siteName: 'Jinlong 金龙',
    },
    twitter: { card: 'summary_large_image', title: meta.title, description: meta.description },
  }
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params
  if (!isSiteLocale(locale)) notFound()

  const content = getHomeContent(locale)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: locale === 'zh-CN' ? '金龙 Jinlong' : 'Jinlong',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, Windows',
    inLanguage: ['pt-BR', 'zh-CN'],
    description: content.meta.description,
    keywords: SEO_KEYWORDS[locale].join(', '),
    url: `${getSiteUrl()}${sitePath(locale)}`,
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <SiteHeader locale={locale} content={content} showSwitch={isLocalePublic(otherSiteLocale(locale))} />
      <main id="main-content">
        <Hero content={content} />
        <Statement content={content} />
        <Showcase locale={locale} content={content} />
        <Difference locale={locale} content={content} />
        <Journey locale={locale} content={content} />
        <NextStep content={content} />
        <Faq content={content} />
        <FinalCta locale={locale} content={content} />
      </main>
      <SiteFooter locale={locale} content={content} />
      <ContactFab locale={locale} content={content} />
    </>
  )
}
