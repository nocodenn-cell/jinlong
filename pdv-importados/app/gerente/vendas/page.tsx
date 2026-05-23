import Link from 'next/link'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { VendasGerenteListClient } from './VendasGerenteListClient'

export default async function GerenteVendasPage() {
  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma)
  const locale = localeFromIdioma(idioma)

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
      <div className="mb-4">
        <Link href="/gerente" className="gerente-nav-back text-sm font-medium hover:underline">
          ← {m.gerente.inicio}
        </Link>
      </div>

      <GerenteFilterBar title={m.gerente.nav_vendas} />

      <VendasGerenteListClient idioma={idioma} locale={locale} />
    </div>
  )
}
