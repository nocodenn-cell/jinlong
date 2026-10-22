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
export const metadata: Metadata = { robots: { index: false, follow: false } }

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
    <main id="main-content" className="jl-section">
      <div className="jl-wrap jl-form jl-form-done" role="status">
        <h1 className="jl-h2">{form.thanksTitle}</h1>
        <p>{form.thanksBody}</p>
        {protocol && (
          <p className="jl-protocol">
            {form.okProtocol}: <strong data-testid="protocol">{protocol}</strong>
          </p>
        )}
        <div className="jl-form-actions">
          {waHref && (
            <a className="jl-btn jl-btn--primary" href={waHref} target="_blank" rel="noopener noreferrer">
              {form.okWhatsapp}
            </a>
          )}
          <a className="jl-btn jl-btn--secondary" href={sitePath(locale)}>
            ← Jinlong
          </a>
        </div>
      </div>
    </main>
  )
}
