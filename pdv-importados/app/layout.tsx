import type { Metadata, Viewport } from 'next'
import { Noto_Sans_SC } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import '@/styles/theme-oriental.css'
// Importado por ÚLTIMO: força o tema claro Bling global sobre os tokens dark.
import '@/styles/theme-bling-light.css'
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
 * App é forçado CLARO (estilo Bling): `<html data-app-theme="classico">` sem a
 * classe `dark`. `color-scheme: light` é aplicado cedo (antes do CSS) para o
 * browser pintar canvas/overscroll branco e evitar flash escuro na navegação.
 * O tema escuro (noturno/dragon-dark) existe no código mas não é aplicado.
 */
export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#ffffff',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="pt-BR"
      className={`${notoSansSC.variable}`}
      data-app-theme="classico"
      data-gerente-ui-theme="dragon-light"
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