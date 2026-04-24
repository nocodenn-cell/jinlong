import { createClient } from '@/lib/supabase/server'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import {
  RecebimentoGerentePageClient,
  type RemessaRecenteRow,
} from './RecebimentoGerentePageClient'

export default async function RecebimentoPage() {
  const { idioma } = await getUsuarioIdioma()
  const supabase = await createClient()
  const { data: produtos } = await supabase
    .from('produtos')
    .select('id, nome, codigo_barras')
    .eq('ativo', true)
    .order('nome', { ascending: true })
    .limit(200)

  const { data: remessasRaw } = await supabase
    .from('remessas')
    .select('id, origem_descricao, status, created_at')
    .order('created_at', { ascending: false })
    .limit(15)

  const remessasRecentes: RemessaRecenteRow[] = (remessasRaw ?? []).map((r) => ({
    id: r.id as string,
    origem_descricao: r.origem_descricao as string,
    status: r.status as string,
    created_at: r.created_at as string,
  }))

  return (
    <RecebimentoGerentePageClient
      idioma={idioma}
      produtos={produtos ?? []}
      remessasRecentes={remessasRecentes}
    />
  )
}
