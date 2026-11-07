import type { Metadata } from 'next'
import './hub.css'

export const metadata: Metadata = { title: 'Nature Code · Hub comercial', robots: { index: false, follow: false } }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
