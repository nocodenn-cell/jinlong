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
 * Fase 0 — Layout Compiler: app travado em tema CLARO ("cara de Bling").
 * `color-scheme: light` faz o browser pintar canvas/overscroll default na cor
 * clara, evitando flash de fundo escuro nos gaps de paint da navegação soft.
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
        {/* Skip to main content link for keyboard navigation (WCAG 2.1 Level A) */}
        <a
          href="#main-content"
          className="skip-link bg-[var(--surface)] text-jl-fg-1 px-4 py-2 rounded-b focus:outline-none focus:ring-2 focus:ring-primary"
        >
          Ir para conteúdo principal
        </a>
        <AppThemeProvider>
          {children}
          <Analytics />
        </AppThemeProvider>
      </body>
    </html>
  )
}