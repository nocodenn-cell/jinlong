import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { getHomeContent } from '@/lib/content'
import { isSiteLocale, SITE_LOCALES } from '@/lib/locales'
import { isLocalePublic } from '@/lib/publication'
import { getSiteUrl } from '@/lib/siteUrl'
import '@/styles/site.css'

/**
 * Noto Sans SC (SIL OFL 1.1, app/fonts/OFL-NotoSansSC.txt) em subsets por papel: marca (900),
 * interface (500) e títulos em chinês (700). Regerar com `npm run fonts:subset`.
 */
const cjk = localFont({
  src: [
    { path: '../fonts/noto-sans-sc-500-subset.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/noto-sans-sc-700-subset.woff2', weight: '700', style: 'normal' },
    { path: '../fonts/noto-sans-sc-900-subset.woff2', weight: '900', style: 'normal' },
  ],
  variable: '--f-cjk',
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
  themeColor: '#ffffff',
}

interface RootLayoutProps {
  children: ReactNode
  params: Promise<{ locale: string }>
}

/** Layout raiz próprio do site: `<html lang>` correto já no HTML do servidor. */
export default async function RootLayout({ children, params }: RootLayoutProps) {
  const { locale } = await params
  if (!isSiteLocale(locale) || !isLocalePublic(locale)) notFound()

  const { skipLink } = getHomeContent(locale)
  return (
    <html lang={locale} className={cjk.variable}>
      <body className="jl">
        <a href="#main-content" className="jl-skip">
          {skipLink}
        </a>
        {children}
      </body>
    </html>
  )
}
