import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import '@/styles/theme-oriental.css'
import { AppThemeProvider } from '@/components/theme/AppThemeProvider'
import { HydrationFix } from '@/components/ui/HydrationFix'
import React from 'react'

export const metadata: Metadata = {
  title: {
    default: 'FastProduct',
    template: '%s | FastProduct',
  },
  description: 'Importados · operações seguras',
}

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
      data-app-theme="claro"
      data-gerente-ui-theme="dragon-light"
      suppressHydrationWarning
    >
      <body
        className="antialiased selection:bg-blue-100 selection:text-blue-900"
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