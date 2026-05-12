import { unstable_noStore as noStore } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { ProdutosGerentePageClient } from './ProdutosGerentePageClient'
import type { ProdutoGerenteRow } from './produtoGerenteTypes'

/** Lista muda com importação/cadastro — evita HTML estático em cache após `revalidatePath`. */
export const dynamic = 'force-dynamic'

export default async function ProdutosPage() {
  noStore()
  const { idioma } = await getUsuarioIdioma()
  const supabase = await createClient()
  const { data: produtos } = await supabase
    .from('produtos')
    .select('id, nome, codigo_barras, preco_varejo, origem, tem_nf, ativo, imagem_url')
    .order('nome', { ascending: true })

  const rows: ProdutoGerenteRow[] = (produtos ?? []).map((r) => {
    const row = r as Record<string, unknown>
    return {
      id: String(row.id ?? ''),
      nome: String(row.nome ?? ''),
      codigo_barras: (row.codigo_barras as string | null) ?? null,
      preco_varejo: Number(row.preco_varejo ?? 0),
      origem: String(row.origem ?? ''),
      tem_nf: Boolean(row.tem_nf),
      ativo: Boolean(row.ativo),
      imagem_url: (row.imagem_url as string | null | undefined) ?? null,
    }
  })

  return <ProdutosGerentePageClient idioma={idioma} rows={rows} />
}
