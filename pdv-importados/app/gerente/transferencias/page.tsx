import { createClient } from '@/lib/supabase/server'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { TransferenciasGerentePageClient } from './TransferenciasGerentePageClient'

export default async function TransferenciasPage() {
  const { idioma } = await getUsuarioIdioma()
  const supabase = await createClient()
  const { data: lojas } = await supabase.from('lojas').select('id, nome, codigo').eq('ativo', true).order('nome')

  const podeTransferir = (lojas?.length ?? 0) >= 2
  let produtos: {
    id: string
    nome: string
    unidade_medida: string
    limite_transferencia_sem_observacao: number | null
  }[] = []
  if (podeTransferir) {
    const { data } = await supabase
      .from('produtos')
      .select('id, nome, unidade_medida, limite_transferencia_sem_observacao')
      .eq('ativo', true)
      .order('nome')
      .limit(300)
    produtos = data ?? []
  }

  return <TransferenciasGerentePageClient idioma={idioma} lojas={lojas ?? []} produtos={produtos} />
}
