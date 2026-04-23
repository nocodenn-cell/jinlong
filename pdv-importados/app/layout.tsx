import type { Metadata } from 'next'
import './globals.css'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { htmlLangFromIdioma } from '@/idioma/htmlLang'

export const metadata: Metadata = {
  title: 'PDV Importados',
  description: 'Sistema de ponto de venda para lojas de importados',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { idioma } = await getUsuarioIdioma()
  const lang = htmlLangFromIdioma(idioma)

  return (
    <html lang={lang}>
      <body>{children}</body>
    </html>
  )
}