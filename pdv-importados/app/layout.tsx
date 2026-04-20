import type { Metadata } from 'next'
import './globals.css'

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
    <html lang="pt">
      <body>{children}</body>
    </html>
  )
}