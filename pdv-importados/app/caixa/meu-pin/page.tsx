import { redirect } from 'next/navigation'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'
import { createClient } from '@/lib/supabase/server'
import { listarPinsEquipeAction } from './actions'
import { MeuPinClient } from './MeuPinClient'

/** "Meu PIN do caixa": o funcionário define o PIN de 4 dígitos do PDV; gerente/dono libera (reset) PIN da equipe. */
export default async function MeuPinPage() {
  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma).meu_pin
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=%2Fcaixa%2Fmeu-pin')
  const lista = await listarPinsEquipeAction()
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold">{m.titulo}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{m.subtitulo}</p>
      <MeuPinClient m={m} inicial={lista.ok ? lista.data ?? [] : []} indisponivel={!lista.ok} />
    </main>
  )
}
