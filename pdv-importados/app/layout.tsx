import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
/* Fontes self-hosted (@fontsource): o build não depende do Google Fonts. */
import '@fontsource/noto-sans-sc/latin-400.css'
import '@fontsource/noto-sans-sc/latin-500.css'
import '@fontsource/noto-sans-sc/latin-600.css'
import '@fontsource/noto-sans-sc/latin-700.css'
import './globals.css'
import '@/styles/theme-oriental.css'
/* DS Onda 2 — depois do oriental/jl para prevalecer (Button, focus, bridges) */
import '@/styles/ds/index.css'
import { AppThemeProvider } from '@/components/theme/AppThemeProvider'
import { HydrationFix } from '@/components/ui/HydrationFix'
import React from 'react'

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
      data-app-theme="classico"
      data-gerente-ui-theme="dragon-light"
      suppressHydrationWarning
    >
      <body
        className="antialiased"
      >
        <HydrationFix />
        {/* Skip to main content link for keyboard navigation (WCAG 2.1 Level A) */}
        <a
          href="#main-content"
          className="skip-link bg-jl-surface-base text-foreground border border-border px-4 py-2 rounded-b focus:outline-none focus:ring-2 focus:ring-primary"
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