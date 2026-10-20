import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Benefits } from '@/components/Benefits'
import { Dashboard } from '@/components/Dashboard'
import { FinalCta } from '@/components/FinalCta'
import { Hero } from '@/components/Hero'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { Steps } from '@/components/Steps'
import { getHomeContent } from '@/lib/content'
import { isSiteLocale, otherSiteLocale, sitePath, type SiteLocale } from '@/lib/locales'
import { isLocaleDraft, isLocalePublic, isZhReviewed } from '@/lib/publication'

interface HomePageProps {
  params: Promise<{ locale: string }>
}

function buildAlternates(locale: SiteLocale): Metadata['alternates'] {
  const languages: Record<string, string> = { 'pt-BR': sitePath('pt-BR') }
  if (isZhReviewed()) languages['zh-CN'] = sitePath('zh-CN')
  return { canonical: sitePath(locale), languages }
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
  return (
    <>
      {isLocaleDraft(locale) && (
        <p className="jl-draft" role="note">
          {content.draftBanner}
        </p>
      )}
      <SiteHeader locale={locale} content={content} showSwitch={isLocalePublic(otherSiteLocale(locale))} />
      <main id="main-content">
        <Hero locale={locale} content={content} />
        <Benefits content={content} />
        <Steps content={content} />
        <Dashboard content={content} />
        <FinalCta locale={locale} content={content} />
      </main>
      <SiteFooter locale={locale} content={content} />
    </>
  )
}
