/**
 * Lógica pura do DRE — extraída para permitir testes de regressão.
 * Não contém chamadas a Supabase nem a Server Actions.
 */

export type DrePeriodoParams = {
  spDe: string | undefined
  spAte: string | undefined
  periodoDe: string   // dados.periodo.de (YYYY-MM-DD)
  periodoAte: string  // dados.periodo.ate (YYYY-MM-DD)
}

/**
 * F10: deriva o intervalo de despesas a partir do mesmo período resolvido
 * pelas receitas, eliminando o drift UTC de Date.now() - 30 * 86_400_000.
 *
 * Quando o usuário fornece filtros na URL, usa esses valores.
 * Quando não fornece, ancora em dados.periodo.de / dados.periodo.ate
 * (já tz-aware, resolução feita por carregarDadosRelatoriosGerente).
 */
export function derivarPeriodoDespesas(p: DrePeriodoParams): {
  despesasDe: string
  despesasAte: string
} {
  const despesasDe = p.spDe
    ? (() => { const d = new Date(p.spDe); d.setHours(0, 0, 0, 0); return d.toISOString() })()
    : p.periodoDe + 'T00:00:00.000Z'

  const despesasAte = p.spAte
    ? (() => { const d = new Date(p.spAte); d.setHours(23, 59, 59, 999); return d.toISOString() })()
    : p.periodoAte + 'T23:59:59.999Z'

  return { despesasDe, despesasAte }
}

export type DreInputs = {
  receitaLiquida: number
  totalDescontos: number
  margemBruta: number | null   // null quando custo não confiável
  despesasPagas: number | null // null quando query falhou
}

/**
 * F9: calcula os valores exibíveis no DRE.
 *
 * custoEstimado foi REMOVIDO deliberadamente — a derivação
 * receitaLiquida - margemBruta mistura bases incompatíveis:
 *   receitaLiquida   = SUM(v.total_liquido)    → inclui desconto de gerente
 *   margemBruta      = RPC 064 sobre iv.preco_unitario → não inclui desconto de gerente
 * O erro resultante é exatamente o valor dos descontos de gerente do período.
 */
export function calcularDre(inputs: DreInputs) {
  const receitaBruta = inputs.receitaLiquida + inputs.totalDescontos

  const resultadoEstimado =
    inputs.margemBruta !== null && inputs.despesasPagas !== null
      ? inputs.margemBruta - inputs.despesasPagas
      : null

  return {
    receitaBruta,
    receitaLiquida: inputs.receitaLiquida,
    totalDescontos: inputs.totalDescontos,
    margemBruta: inputs.margemBruta,
    // custoEstimado: ausente — ver comentário acima (F9)
    despesasPagas: inputs.despesasPagas,
    resultadoEstimado,
  }
}
