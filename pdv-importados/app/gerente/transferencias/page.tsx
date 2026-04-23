import { createClient } from '@/lib/supabase/server'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { TransferenciasGerentePageClient } from './TransferenciasGerentePageClient'

export default async function TransferenciasPage() {
  const { idioma } = await getUsuarioIdioma()
  const supabase = await createClient()
  const { data: lojas } = await supabase.from('lojas').select('id, nome, codigo').eq('ativo', true).order('nome')

  const podeTransferir = (lojas?.length ?? 0) >= 2
  let produtos: { id: string; nome: string }[] = []
  if (podeTransferir) {
    const { data } = await supabase.from('produtos').select('id, nome').eq('ativo', true).order('nome').limit(300)
    produtos = data ?? []
  }

  return <TransferenciasGerentePageClient idioma={idioma} lojas={lojas ?? []} produtos={produtos} />
}
