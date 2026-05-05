import type { Metadata } from 'next'
import { Noto_Sans_SC } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import '@/styles/theme-oriental.css'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { htmlLangFromIdioma } from '@/idioma/htmlLang'
import { getMessages } from '@/i18n/getMessages'
import { AppThemeProvider } from '@/components/theme/AppThemeProvider'
import React from 'react'

// Fonte para chinês simplificado
const notoSansSC = Noto_Sans_SC({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-sc',
  display: 'swap',
})

/**
 * Metadados dinâmicos conforme idioma do usuário (cookie/sessão).
 * Título da aba alinhado à nova marca (Jīn Lóng / 金龍).
 */
export async function generateMetadata(): Promise<Metadata> {
  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma)

  const brandTitle = m.brand?.logo_subtitle ?? '金龍'
  const tagline = m.login?.tagline ?? 'Importados · operações seguras'

  return {
    title: {
      default: `Jīn Lóng · ${brandTitle}`,
      template: `%s | Jīn Lóng · ${brandTitle}`,
    },
    description: tagline,
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { idioma } = await getUsuarioIdioma()
  const htmlLang = htmlLangFromIdioma(idioma)

  return (
    <html lang={htmlLang} className={`${notoSansSC.variable} dark`} data-app-theme="noturno" data-gerente-ui-theme="noturno" suppressHydrationWarning>
      <body className={`${notoSansSC.variable} antialiased selection:bg-emerald-500/30 selection:text-emerald-200 ${idioma === 'zh' ? 'font-noto-sc' : ''}`}>
        <AppThemeProvider>
          {children}
          <Analytics />
        </AppThemeProvider>
      </body>
    </html>
  )
}