import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Benefits } from '@/components/Benefits'
import { FinalCta } from '@/components/FinalCta'
import { Hero } from '@/components/Hero'
import { LanguageCompare } from '@/components/LanguageCompare'
import { Screens } from '@/components/Screens'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { Steps } from '@/components/Steps'
import { hasContactChannel } from '@/components/TrialCta'
import { WholesaleSection } from '@/components/WholesaleSection'
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
      <SiteHeader
        locale={locale}
        content={content}
        showSwitch={isLocalePublic(otherSiteLocale(locale))}
        hasContact={hasContactChannel(locale)}
      />
      <main id="main-content">
        <Hero locale={locale} content={content} />
        <Benefits locale={locale} content={content} />
        <Screens locale={locale} content={content} />
        <WholesaleSection locale={locale} content={content} />
        <LanguageCompare locale={locale} content={content} />
        <Steps content={content} />
        <FinalCta locale={locale} content={content} />
      </main>
      <SiteFooter locale={locale} content={content} />
    </>
  )
}
