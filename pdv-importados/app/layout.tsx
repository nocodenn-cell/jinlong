import type { Metadata } from 'next'
import { Inter, Noto_Sans_SC, Noto_Sans_TC } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

const notoSansSC = Noto_Sans_SC({
  weight: ['400', '500', '600'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-noto-sc',
  preload: false,
})

const notoSansTC = Noto_Sans_TC({
  weight: ['400', '500', '600'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-noto-tc',
  preload: false,
})

export const metadata: Metadata = {
  title: 'PDV Importados',
  description: 'Sistema de ponto de venda para lojas de importados',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="pt"
      className={`${inter.className} ${notoSansSC.variable} ${notoSansTC.variable}`}
    >
      <body className={inter.className}>{children}</body>
    </html>
  )
}