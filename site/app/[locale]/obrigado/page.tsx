import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getHomeContent } from '@/lib/content'
import { getContactChannels } from '@/lib/contactChannels'
import { isSiteLocale, sitePath } from '@/lib/locales'

interface Props {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ p?: string }>
}

export const dynamic = 'force-dynamic'
export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { locale } = await params
  const title = isSiteLocale(locale) ? `${getHomeContent(locale).form.thanksTitle} · Jinlong 金龙` : 'Jinlong 金龙'
  return { title: { absolute: title }, robots: { index: false, follow: false } }
}

export default async function ThanksPage({ params, searchParams }: Props) {
  const { locale } = await params
  if (!isSiteLocale(locale)) notFound()
  const { p } = await searchParams
  const protocol = typeof p === 'string' && /^JL-\d{6}-[A-Z2-9]{6}$/.test(p) ? p : null
  const { form } = getHomeContent(locale)
  const wa = getContactChannels(locale).find((c) => c.id === 'whatsapp')
  let waHref: string | null = null
  if (wa) {
    const url = new URL(wa.href)
    url.searchParams.set('text', `${form.thanksWaText} ${protocol ?? ''}`.trim())
    waHref = url.toString()
  }
  return (
    <main id="main-content" className="jl-thanks">
      <div className="jl-form-card jl-form-done" role="status">
        <p className="jl-form-top">
          <span>{form.top}</span>
          <span aria-hidden="true">✓</span>
        </p>
        <h1>{form.thanksTitle}</h1>
        <p>{form.thanksBody}</p>
        {protocol && (
          <p className="jl-protocol">
            {form.okProtocol}: <strong data-testid="protocol">{protocol}</strong>
          </p>
        )}
        <p>{form.okKeep}</p>
        <div className="jl-thanks-actions">
          {waHref && (
            <a className="jl-form-action" href={waHref} target="_blank" rel="noopener noreferrer">
              {form.okWhatsapp} <span aria-hidden="true">↗</span>
            </a>
          )}
          <a className="jl-quiet-link" href={sitePath(locale)}>
            ← {form.back}
          </a>
        </div>
      </div>
    </main>
  )
}
