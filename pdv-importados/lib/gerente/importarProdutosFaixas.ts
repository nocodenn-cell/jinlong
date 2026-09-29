/**
 * Snapshot/restauração das faixas de atacado (`precos_atacado`) usados pelo
 * rollback da importação em lote.
 *
 * Por que existe: a atualização por id passa pela RPC
 * `atualizar_produto_com_faixa_atacado`, que além de `produtos` faz upsert e
 * DESATIVA faixas. O rollback antigo só refazia o `UPDATE` em `produtos` — uma
 * faixa desativada (ou criada/alterada) pela RPC ficava assim depois do
 * "rollback". Aqui o estado das faixas é capturado antes e devolvido depois.
 *
 * Sem `'use server'`: são helpers puros/utilitários, importados pela action.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type FaixaSnapshot = {
  id: string
  quantidade_minima: number
  preco_unitario: number
  ativo: boolean
}

export type PlanoRestauracaoFaixas = {
  /** Faixas que existiam antes e hoje estão diferentes (preço, mínimo ou ativo). */
  restaurar: FaixaSnapshot[]
  /** Faixas que NÃO existiam antes (criadas pela importação). */
  remover: string[]
}

/**
 * Compara o estado capturado antes com o atual e decide o que desfazer. Puro.
 * Faixa que sumiu (foi apagada) não é recriada aqui: a importação nunca apaga
 * faixas, só cria/altera/desativa.
 */
export function planejarRestauracaoFaixas(
  antes: readonly FaixaSnapshot[],
  agora: readonly FaixaSnapshot[],
): PlanoRestauracaoFaixas {
  const idsAntes = new Set(antes.map((f) => f.id))
  const atuaisPorId = new Map(agora.map((f) => [f.id, f]))

  const remover = agora.filter((f) => !idsAntes.has(f.id)).map((f) => f.id)
  const restaurar = antes.filter((f) => {
    const atual = atuaisPorId.get(f.id)
    if (!atual) return false
    return (
      atual.ativo !== f.ativo ||
      atual.quantidade_minima !== f.quantidade_minima ||
      atual.preco_unitario !== f.preco_unitario
    )
  })
  return { restaurar, remover }
}

function mapRow(r: {
  id: unknown
  quantidade_minima: unknown
  preco_unitario: unknown
  ativo: unknown
}): FaixaSnapshot {
  return {
    id: String(r.id),
    quantidade_minima: Number(r.quantidade_minima),
    preco_unitario: Number(r.preco_unitario),
    ativo: r.ativo !== false,
  }
}

/** Lê TODAS as faixas do produto (ativas e inativas). */
export async function capturarFaixasProduto(
  supabase: SupabaseClient,
  produtoId: string,
): Promise<{ ok: true; faixas: FaixaSnapshot[] } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('precos_atacado')
    .select('id, quantidade_minima, preco_unitario, ativo')
    .eq('produto_id', produtoId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, faixas: (data ?? []).map(mapRow) }
}

/**
 * Devolve as faixas do produto ao estado capturado. Ordem: primeiro remove as
 * criadas (libera o índice único parcial por produto+quantidade), depois
 * restaura as existentes. Devolve a lista de problemas (vazia = tudo certo).
 */
export async function restaurarFaixasProduto(
  supabase: SupabaseClient,
  produtoId: string,
  antes: readonly FaixaSnapshot[],
): Promise<string[]> {
  const problemas: string[] = []
  const atual = await capturarFaixasProduto(supabase, produtoId)
  if (!atual.ok) return [`faixas de atacado: ${atual.error}`]

  const plano = planejarRestauracaoFaixas(antes, atual.faixas)

  if (plano.remover.length > 0) {
    const { error } = await supabase.from('precos_atacado').delete().in('id', plano.remover)
    if (error) problemas.push(`faixas de atacado (remover criadas): ${error.message}`)
  }

  for (const f of plano.restaurar) {
    const { error } = await supabase
      .from('precos_atacado')
      .update({
        quantidade_minima: f.quantidade_minima,
        preco_unitario: f.preco_unitario,
        ativo: f.ativo,
      })
      .eq('id', f.id)
    if (error) problemas.push(`faixas de atacado (restaurar ${f.id}): ${error.message}`)
  }
  return problemas
}
