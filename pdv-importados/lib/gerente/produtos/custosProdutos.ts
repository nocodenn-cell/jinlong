/**
 * Leitura do custo de aquisição (`preco_custo`, `preco_custo_medio`) — N1.
 *
 * A coluna `produtos.preco_custo` NÃO é legível por usuários autenticados (privilégio de coluna revogado na
 * migration 20261009180000). O único caminho é a view `produtos_custos`, que devolve linhas apenas para
 * GERENTE/DONO da loja e ADMIN; para OPERADOR devolve 0 linhas (custo ausente → `null`).
 *
 * NÃO selecione `preco_custo` em `from('produtos')`: falha com 42501. Use estas funções.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type CustoProduto = {
  preco_custo: number | null
  preco_custo_medio: number | null
}

const VAZIO: CustoProduto = { preco_custo: null, preco_custo_medio: null }
const LOTE = 150

function num(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Custos por produto. LANÇA em erro de leitura: um custo "nulo por falha" não pode ser confundido com
 * "sem custo" (ex.: uma edição/importação reescreveria o campo vazio).
 */
export async function carregarCustosProdutos(
  supabase: SupabaseClient,
  ids: readonly string[],
): Promise<Map<string, CustoProduto>> {
  const unicos = Array.from(new Set(ids.filter(Boolean)))
  const mapa = new Map<string, CustoProduto>()
  for (let i = 0; i < unicos.length; i += LOTE) {
    const parte = unicos.slice(i, i + LOTE)
    const { data, error } = await supabase
      .from('produtos_custos')
      .select('produto_id, preco_custo, preco_custo_medio')
      .in('produto_id', parte)
    if (error) throw new Error(`custo_produtos_indisponivel: ${error.message}`)
    for (const r of (data ?? []) as {
      produto_id: string
      preco_custo: unknown
      preco_custo_medio: unknown
    }[]) {
      mapa.set(r.produto_id, { preco_custo: num(r.preco_custo), preco_custo_medio: num(r.preco_custo_medio) })
    }
  }
  return mapa
}

/** Acrescenta `preco_custo` / `preco_custo_medio` às linhas (por `id`); sem permissão → `null`. */
export async function anexarCustosProdutos<T extends { id: string }>(
  supabase: SupabaseClient,
  linhas: readonly T[],
): Promise<(T & CustoProduto)[]> {
  const mapa = await carregarCustosProdutos(supabase, linhas.map((l) => l.id))
  return linhas.map((l) => ({ ...l, ...(mapa.get(l.id) ?? VAZIO) }))
}
