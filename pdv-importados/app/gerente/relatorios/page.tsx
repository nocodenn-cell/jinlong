import { Suspense } from 'react'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'
import { RelatoriosGerentePageClient } from './RelatoriosGerentePageClient'

export default async function GerenteRelatoriosPage() {
  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma)

  return (
    <Suspense
      fallback={
        <div className="gerente-fin-muted mx-auto max-w-[1100px] px-4 py-6 sm:px-6">{m.comum.carregando}</div>
      }
    >
      <RelatoriosGerentePageClient idioma={idioma} />
    </Suspense>
  )
}
