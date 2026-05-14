import type { SupabaseClient } from '@supabase/supabase-js'

export type BloqueioExclusaoFisica =
  | 'itens_venda'
  | 'remessa_itens'
  | 'movimentos_estoque_log'
  | 'estoque_reposicoes_cancelamento'

/**
 * Se existir qualquer referência operacional relevante, não se deve apagar o produto
 * (apenas inativar). Critério alinhado a FKs `RESTRICT` e trilhos de auditoria.
 */
export async function motivoBloqueioExclusaoFisica(
  supabase: SupabaseClient,
  produtoId: string,
): Promise<BloqueioExclusaoFisica | null> {
  const { count: nVendas, error: e1 } = await supabase
    .from('itens_venda')
    .select('id', { count: 'exact', head: true })
    .eq('produto_id', produtoId)
  if (e1) throw new Error(`itens_venda: ${e1.message}`)
  if ((nVendas ?? 0) > 0) return 'itens_venda'

  const { count: nRem, error: e2 } = await supabase
    .from('remessa_itens')
    .select('id', { count: 'exact', head: true })
    .eq('produto_id', produtoId)
  if (e2) throw new Error(`remessa_itens: ${e2.message}`)
  if ((nRem ?? 0) > 0) return 'remessa_itens'

  const { count: nMov, error: e3 } = await supabase
    .from('movimentos_estoque_log')
    .select('id', { count: 'exact', head: true })
    .eq('produto_id', produtoId)
  if (e3) throw new Error(`movimentos_estoque_log: ${e3.message}`)
  if ((nMov ?? 0) > 0) return 'movimentos_estoque_log'

  const { count: nRep, error: e4 } = await supabase
    .from('estoque_reposicoes_cancelamento')
    .select('venda_id', { count: 'exact', head: true })
    .eq('produto_id', produtoId)
  if (e4) throw new Error(`estoque_reposicoes_cancelamento: ${e4.message}`)
  if ((nRep ?? 0) > 0) return 'estoque_reposicoes_cancelamento'

  return null
}
