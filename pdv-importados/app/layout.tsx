import type { Metadata } from 'next'
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
      data-gerente-ui-theme="noturno"
      suppressHydrationWarning
    >
      <body className={`${notoSansSC.variable} antialiased selection:bg-emerald-500/30 selection:text-emerald-200`}>
        <HydrationFix />
        <AppThemeProvider>
          {children}
          <Analytics />
        </AppThemeProvider>
      </body>
    </html>
  )
}