import { redirect } from 'next/navigation'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'
import { getUsuarioAtual } from '@/lib/auth/usuarioAtual'
import { PalmShell } from '@/components/palm/PalmShell'

export const dynamic = 'force-dynamic'

export default async function PalmLayout({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioAtual()
  if (!usuario.userId || !usuario.lojaId) redirect('/login?next=/palm/vendas')
  const { idioma } = await getUsuarioIdioma()
  return <PalmShell m={getMessages(idioma)}>{children}</PalmShell>
}
