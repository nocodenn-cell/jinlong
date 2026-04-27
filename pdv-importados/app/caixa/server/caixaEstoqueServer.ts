import { createClient } from '@/lib/supabase/server'

export type EstoqueResumoCaixa = {
  quantidade_atual: number | null
  estoque_minimo: number | null
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
