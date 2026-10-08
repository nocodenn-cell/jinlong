import type { Metadata } from 'next'
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans, Noto_Serif_SC } from 'next/font/google'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { SiteLangSync } from '@/components/site/SiteLangSync'
import { isSiteLocale, SITE_LOCALES } from '@/lib/site/locales'
import { isLocalePublic } from '@/lib/site/publication'
import '@/styles/site/site.css'

const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-site-display',
  display: 'swap',
})

const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-site-sans',
  display: 'swap',
})

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['500'],
  variable: '--font-site-mono',
  display: 'swap',
})

/** CJK: fatias por unicode-range, baixadas só quando há caracteres chineses. */
const displayZh = Noto_Serif_SC({
  weight: ['600'],
  variable: '--font-site-display-zh',
  display: 'swap',
  preload: false,
})

export const dynamicParams = false

export function generateStaticParams() {
  return SITE_LOCALES.map((locale) => ({ locale }))
}

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.jinlong.app'),
}

interface SiteLayoutProps {
  children: ReactNode
  params: Promise<{ locale: string }>
}

export default async function SiteLayout({ children, params }: SiteLayoutProps) {
  const { locale } = await params
  if (!isSiteLocale(locale) || !isLocalePublic(locale)) notFound()

  const fonts = [display, sans, mono, displayZh].map((font) => font.variable).join(' ')
  return (
    <div className={`site-root ${fonts}`} lang={locale}>
      <SiteLangSync locale={locale} />
      {children}
    </div>
  )
}
