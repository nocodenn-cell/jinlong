import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { HybridSimulator } from '@/components/HybridSimulator'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { getHomeContent } from '@/lib/content'
import { isSiteLocale, otherSiteLocale, sitePath, type SiteLocale } from '@/lib/locales'
import { isLocaleDraft, isLocalePublic, isZhReviewed } from '@/lib/publication'
import { SIMULADOR_FONTES } from '@/lib/simuladorHibrido'
import { getSimuladorCopy, SIMULADOR_SLUG } from '@/lib/simuladorHibrido.copy'

interface PageProps {
  params: Promise<{ locale: string }>
}

const pathFor = (locale: SiteLocale) => `${sitePath(locale)}/${SIMULADOR_SLUG}`

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params
  if (!isSiteLocale(locale)) return {}
  const copy = getSimuladorCopy(locale)
  const languages: Record<string, string> = { 'pt-BR': pathFor('pt-BR') }
  if (isZhReviewed()) {
    languages['zh-CN'] = pathFor('zh-CN')
    languages['x-default'] = pathFor('zh-CN')
  }
  return {
    title: { absolute: copy.metaTitle },
    description: copy.metaDescription,
    alternates: { canonical: pathFor(locale), languages },
    robots: isLocaleDraft(locale) ? { index: false, follow: false } : undefined,
    openGraph: { title: copy.metaTitle, description: copy.metaDescription, locale: locale.replace('-', '_'), type: 'website' },
  }
}

export default async function SimuladorPage({ params }: PageProps) {
  const { locale } = await params
  if (!isSiteLocale(locale)) notFound()
  const content = getHomeContent(locale)
  const copy = getSimuladorCopy(locale)
  return (
    <>
      <SiteHeader locale={locale} content={content} showSwitch={isLocalePublic(otherSiteLocale(locale))} anchorsOnHome />
      <main id="main-content" className="jl-hs-page">
        <section className="jl-section" aria-labelledby="h-hs">
          <div className="jl-hs-wrap">
            <p className="jl-hs-eyebrow">{copy.eyebrow}</p>
            <h1 id="h-hs">{copy.title}</h1>
            <p className="jl-hs-lead">{copy.lead}</p>
            <p className="jl-hs-deadline">{copy.deadline}</p>
            <HybridSimulator locale={locale} copy={copy} />
            <div className="jl-hs-cta">
              <h2>{copy.ctaTitle}</h2>
              <p>{copy.ctaLead}</p>
              <a className="jl-cta-gold" href={`${sitePath(locale)}#contato`}>
                <span>{copy.cta}</span>
                <b aria-hidden="true">↗</b>
              </a>
            </div>
            <aside className="jl-hs-sources" aria-labelledby="h-hs-src">
              <h2 id="h-hs-src">{copy.sourcesTitle}</h2>
              <ol>
                {SIMULADOR_FONTES.map((f) => (
                  <li key={f.id} lang="pt-BR">
                    <a href={f.url} target="_blank" rel="noopener noreferrer">{f.label}</a>{' '}
                    <em lang={locale}>({copy.sourceStatus[f.status]})</em>
                  </li>
                ))}
              </ol>
            </aside>
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} content={content} />
    </>
  )
}
