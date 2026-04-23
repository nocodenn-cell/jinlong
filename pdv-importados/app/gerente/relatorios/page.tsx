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
        <div style={{ padding: 24, maxWidth: '1100px', margin: '0 auto', color: '#6b7280' }}>
          {m.comum.carregando}
        </div>
      }
    >
      <RelatoriosGerentePageClient idioma={idioma} />
    </Suspense>
  )
}
