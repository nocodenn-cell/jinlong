import type { Metadata, Viewport } from 'next'
import { Noto_Sans_SC } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import '@/styles/theme-oriental.css'
import { AppThemeProvider } from '@/components/theme/AppThemeProvider'
import { HydrationFix } from '@/components/ui/HydrationFix'
import React from 'react'

const notoSansSC = Noto_Sans_SC({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-sc',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Jīn Lóng · 金龍',
    template: '%s | Jīn Lóng · 金龍',
  },
  description: 'Importados · operações seguras',
}

/**
 * App é forçado dark (`<html class="dark">`). Sem `color-scheme: dark`, o browser
 * trata a página como light-scheme e pinta o canvas/overscroll default BRANCO nos
 * gaps de paint da navegação soft → "flash de fundo branco" na troca de tela.
 * O meta `color-scheme` é aplicado no paint mais cedo (antes do CSS).
 */
export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#020617',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="pt-BR"
      className={`${notoSansSC.variable} dark`}
      data-app-theme="noturno"
      suppressHydrationWarning
    >
      <body
        className={`${notoSansSC.variable} antialiased selection:bg-success/35 selection:text-success-foreground`}
      >
        <HydrationFix />
        <AppThemeProvider>
          {children}
          <Analytics />
        </AppThemeProvider>
      </body>
    </html>
  )
}