import { getUsuarioAtual } from '@/lib/auth/usuarioAtual'
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

/** Leitura do saldo da loja da sessão. Não altera estoque. */
export async function consultarEstoqueProdutoCaixaImpl(produtoId: string): Promise<EstoqueResumoCaixa> {
  const { userId, lojaId } = await getUsuarioAtual()
  if (!userId || !lojaId) return { quantidade_atual: null, estoque_minimo: null }
  const supabase = await createClient()
  return estoqueResumoParaCaixa(supabase, produtoId, lojaId)
}
