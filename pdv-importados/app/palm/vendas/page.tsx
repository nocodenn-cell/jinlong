import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'
import { PalmVendasClient } from '@/app/palm/vendas/PalmVendasClient'

export const dynamic = 'force-dynamic'

export default async function PalmVendasPage() {
  const { idioma } = await getUsuarioIdioma()
  return <PalmVendasClient m={getMessages(idioma)} />
}
