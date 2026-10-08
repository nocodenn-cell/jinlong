import type { Metadata, Viewport } from 'next'
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import localFont from 'next/font/local'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { getHomeContent } from '@/lib/content'
import { isSiteLocale, SITE_LOCALES } from '@/lib/locales'
import { isLocalePublic } from '@/lib/publication'
import '@/styles/site.css'
import { getSiteUrl } from '@/lib/siteUrl'

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

/**
 * Títulos zh-CN: subset da Noto Serif SC 600 (SIL OFL 1.1, ver app/fonts/OFL.txt)
 * só com os caracteres usados. Regerar com `npm run fonts:subset` quando o texto mudar.
 */
const displayZh = localFont({
  src: '../fonts/noto-serif-sc-600-subset.woff2',
  weight: '600',
  variable: '--font-site-display-zh',
  display: 'swap',
  preload: false,
})


export function generateStaticParams() {
  return SITE_LOCALES.map((locale) => ({ locale }))
}

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f6f1e7',
}

interface RootLayoutProps {
  children: ReactNode
  params: Promise<{ locale: string }>
}

/** Layout raiz próprio do site: `<html lang>` correto já no HTML do servidor. */
export default async function RootLayout({ children, params }: RootLayoutProps) {
  const { locale } = await params
  if (!isSiteLocale(locale) || !isLocalePublic(locale)) notFound()

  const fonts = [display, sans, mono, displayZh].map((font) => font.variable).join(' ')
  const { skipLink } = getHomeContent(locale)
  return (
    <html lang={locale} className={fonts}>
      <body className="site-root">
        <a href="#main-content" className="site-skip">
          {skipLink}
        </a>
        {children}
      </body>
    </html>
  )
}
