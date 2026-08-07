import { createClient } from '@/lib/supabase/server'

export type EstoqueResumoCaixa = {
  quantidade_atual: number | null
  estoque_minimo: number | null
}

/**
 * Versão em lote de `estoqueResumoParaCaixa` — 1 query para N produtos.
 * Usada pela lista de candidatos da busca (evita N+1 no hot-path de leitura).
 * Produto sem linha de estoque na loja fica ausente do mapa (mesma semântica
 * de `null` da versão unitária).
 */
export async function estoqueResumoLoteParaCaixa(
  supabase: Awaited<ReturnType<typeof createClient>>,
  produtoIds: readonly string[],
  lojaId: string,
): Promise<Map<string, EstoqueResumoCaixa>> {
  const mapa = new Map<string, EstoqueResumoCaixa>()
  if (produtoIds.length === 0) return mapa

  const { data } = await supabase
    .from('estoque')
    .select('produto_id, quantidade_atual, estoque_minimo')
    .in('produto_id', [...produtoIds])
    .eq('loja_id', lojaId)

  for (const row of data ?? []) {
    const q = row.quantidade_atual
    const min = row.estoque_minimo
    mapa.set(String(row.produto_id), {
      quantidade_atual: q === undefined || q === null ? null : Number(q),
      estoque_minimo: min === undefined || min === null ? null : Number(min),
    })
  }
  return mapa
}

export async function estoqueResumoParaCaixa(
  supabase: Awaited<ReturnType<typeof createClient>>,
  produtoId: string,
  lojaId: string,
): Promise<EstoqueResumoCaixa> {
  const { data } = await supabase
    .from('estoque')
    .select('quantidade_atual, estoque_minimo')
    .eq('produto_id', produtoId)
    .eq('loja_id', lojaId)
    .maybeSingle()
  if (!data) {
    return { quantidade_atual: null, estoque_minimo: null }
  }
  const q = data.quantidade_atual
  const m = data.estoque_minimo
  return {
    quantidade_atual: q === undefined || q === null ? null : Number(q),
    estoque_minimo: m === undefined || m === null ? null : Number(m),
  }
}
