/**
 * Lógica pura do DRE — extraída para permitir testes de regressão.
 * Não contém chamadas a Supabase nem a Server Actions.
 */

/**
 * Returns the UTC offset in milliseconds for an IANA timezone at a given civil date.
 * Positive = timezone east of UTC (UTC+N); negative = west (UTC-N).
 * Uses 'shortOffset' format (e.g. 'GMT-3', 'GMT+5:30').
 */
function getOffsetMs(ymd: string, tz: string): number {
  const [y, mo, d] = ymd.split('-').map(Number)
  // Noon UTC avoids most DST transition edge cases
  const ref = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0))
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: tz,
    timeZoneName: 'shortOffset',
  }).formatToParts(ref)
  const offsetStr = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT'
  const m = offsetStr.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
  if (!m) return 0
  const sign = m[1] === '+' ? 1 : -1
  return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3] ?? '0', 10)) * 60_000
}

/** ISO timestamp for the start of a civil day (00:00:00.000) in the given IANA timezone. */
function civilDayStartISO(ymd: string, tz: string): string {
  const [y, mo, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, d) - getOffsetMs(ymd, tz)).toISOString()
}

/** ISO timestamp for the end of a civil day (23:59:59.999) in the given IANA timezone. */
function civilDayEndISO(ymd: string, tz: string): string {
  const [y, mo, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, d) + 86_400_000 - 1 - getOffsetMs(ymd, tz)).toISOString()
}

export type DrePeriodoParams = {
  spDe: string | undefined
  spAte: string | undefined
  periodoDe: string   // dados.periodo.de (YYYY-MM-DD)
  periodoAte: string  // dados.periodo.ate (YYYY-MM-DD)
  /** IANA timezone for UTC boundary computation (e.g. 'America/Sao_Paulo'). */
  tz: string
}

/**
 * F10-A: deriva o intervalo de despesas a partir do mesmo período resolvido
 * pelas receitas, eliminando o drift UTC de Date.now() - 30 * 86_400_000.
 *
 * F10-B: converte datas civis (YYYY-MM-DD) para timestamps UTC corretos usando
 * o fuso da loja — evita divergência de ±3h nos limites do período quando o DB
 * armazena data_pagamento em UTC e a loja opera em BRT (UTC-3).
 */
export function derivarPeriodoDespesas(p: DrePeriodoParams): {
  despesasDe: string
  despesasAte: string
} {
  const de = p.spDe ?? p.periodoDe
  const ate = p.spAte ?? p.periodoAte
  return {
    despesasDe: civilDayStartISO(de, p.tz),
    despesasAte: civilDayEndISO(ate, p.tz),
  }
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
