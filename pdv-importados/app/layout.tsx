import type { Metadata } from 'next'
import './globals.css'
import '@/styles/theme-oriental.css'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { htmlLangFromIdioma } from '@/idioma/htmlLang'
import { getMessages } from '@/i18n/getMessages'

/**
 * Metadados dinâmicos conforme idioma do usuário (cookie/sessão).
 * Título da aba alinhado ao subtítulo da marca (Dragon POS / 龙码收银 / 龍碼收銀).
 */
export async function generateMetadata(): Promise<Metadata> {
  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma)

  const brandTitle = m.brand?.logo_subtitle ?? 'Dragon POS'
  const tagline = m.login?.tagline ?? 'Importados · operações seguras'

  // Favicon: `app/icon.svg` (dragão #F59E0B sobre #020617) — convenção Next, link gerado automaticamente.

  return {
    title: {
      default: `Fastproduct · ${brandTitle}`,
      template: `%s | Fastproduct · ${brandTitle}`,
    },
    description: tagline,
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { idioma } = await getUsuarioIdioma()
  const htmlLang = htmlLangFromIdioma(idioma)

  return (
    <html lang={htmlLang} className="dark" suppressHydrationWarning>
      <body className="antialiased selection:bg-emerald-500/30 selection:text-emerald-200">
        {children}
      </body>
    </html>
  )
}
