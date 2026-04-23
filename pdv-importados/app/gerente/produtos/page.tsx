import { createClient } from '@/lib/supabase/server'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { ProdutosGerentePageClient, type ProdutoGerenteRow } from './ProdutosGerentePageClient'

export default async function ProdutosPage() {
  const { idioma } = await getUsuarioIdioma()
  const supabase = await createClient()
  const { data: produtos } = await supabase
    .from('produtos')
    .select('id, nome, codigo_barras, preco_varejo, origem, tem_nf, ativo')
    .order('nome', { ascending: true })

  const rows = (produtos as ProdutoGerenteRow[] | null) ?? []

  return <ProdutosGerentePageClient idioma={idioma} rows={rows} />
}
