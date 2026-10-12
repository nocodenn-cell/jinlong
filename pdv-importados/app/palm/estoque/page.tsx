import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'
import { PalmEstoqueClient } from '@/app/palm/estoque/PalmEstoqueClient'

export const dynamic = 'force-dynamic'

export default async function PalmEstoquePage() {
  const { idioma } = await getUsuarioIdioma()
  return <PalmEstoqueClient m={getMessages(idioma)} />
}
