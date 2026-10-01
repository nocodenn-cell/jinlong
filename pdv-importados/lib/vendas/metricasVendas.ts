/**
 * Definição canônica das métricas de vendas (Onda A — integridade comercial).
 *
 * Identidade = `vendas.id` · estado = `vendas.status` · data = `vendas.data`. O ledger `venda_eventos` é só histórico.
 * Espelha em TS o contrato SQL de `kpis_vendas_gerente` (migration 20260930120000) e de
 * `relatorio_resumo_executivo_periodo`; o teste de contrato entre telas garante que os dois lados concordam.
 *
 *   faturado          = Σ total_liquido das vendas CONCLUIDA
 *   devolucoes        = Σ devolução pós-venda efetiva (operacao_id preenchido) de venda CONCLUIDA
 *                       (a linha gerada por cancelamento tem operacao_id NULL e pertence a venda CANCELADA)
 *   receita_liquida   = faturado − devolucoes
 *   ticket_medio      = faturado / vendas_concluidas (0 sem vendas concluídas; não deduz devolução)
 *   taxa_cancelamento = vendas_canceladas / vendas_registradas, FRAÇÃO 0..1 (0 sem vendas); % é só apresentação
 */

export type StatusVenda = 'CONCLUIDA' | 'CANCELADA'

export type DevolucaoVendaMin = Readonly<{
  valor: number | string | null
  operacao_id: string | null
}>

export type VendaMetricaMin = Readonly<{
  status: string | null
  total_liquido: number | string | null
  devolucoes?: ReadonlyArray<DevolucaoVendaMin> | null
}>

export type MetricasVendas = Readonly<{
  vendasRegistradas: number
  vendasConcluidas: number
  faturado: number
  vendasCanceladas: number
  valorCancelado: number
  devolucoes: number
  receitaLiquida: number
  ticketMedio: number
  taxaCancelamento: number
}>

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function num(v: number | string | null | undefined): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

export function ticketMedio(faturado: number, vendasConcluidas: number): number {
  return vendasConcluidas > 0 ? faturado / vendasConcluidas : 0
}

export function taxaCancelamento(vendasCanceladas: number, vendasRegistradas: number): number {
  return vendasRegistradas > 0 ? vendasCanceladas / vendasRegistradas : 0
}

export function receitaLiquida(faturado: number, devolucoes: number): number {
  return round2(faturado - devolucoes)
}

/** Apresentação: fração 0.25 → "25,0%" (nunca multiplicar no domínio). */
export function formatarPercentual(fracao: number, locale = 'pt-BR'): string {
  const f = Number.isFinite(fracao) ? fracao : 0
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(f)
}

/** Agrega linhas de `vendas` (uma por venda) conforme o contrato canônico. */
export function calcularMetricasVendas(vendas: ReadonlyArray<VendaMetricaMin>): MetricasVendas {
  let concluidas = 0
  let canceladas = 0
  let faturado = 0
  let cancelado = 0
  let devolvido = 0

  for (const v of vendas) {
    const total = num(v.total_liquido)
    if (v.status === 'CONCLUIDA') {
      concluidas += 1
      faturado += total
      for (const d of v.devolucoes ?? []) {
        if (d.operacao_id) devolvido += num(d.valor)
      }
    } else if (v.status === 'CANCELADA') {
      canceladas += 1
      cancelado += total
    }
  }

  const registradas = concluidas + canceladas
  const faturadoR = round2(faturado)
  const devolvidoR = round2(devolvido)
  return {
    vendasRegistradas: registradas,
    vendasConcluidas: concluidas,
    faturado: faturadoR,
    vendasCanceladas: canceladas,
    valorCancelado: round2(cancelado),
    devolucoes: devolvidoR,
    receitaLiquida: receitaLiquida(faturadoR, devolvidoR),
    ticketMedio: ticketMedio(faturadoR, concluidas),
    taxaCancelamento: taxaCancelamento(canceladas, registradas),
  }
}

/** Linha de `kpis_vendas_gerente` (numerics podem chegar como string do PostgREST). */
export type KpisVendasRpcRow = Readonly<{
  vendas_registradas: number | string | null
  vendas_concluidas: number | string | null
  faturado: number | string | null
  vendas_canceladas: number | string | null
  valor_cancelado: number | string | null
  devolucoes: number | string | null
  receita_liquida: number | string | null
  ticket_medio: number | string | null
  taxa_cancelamento: number | string | null
}>

export const METRICAS_VENDAS_VAZIAS: MetricasVendas = {
  vendasRegistradas: 0,
  vendasConcluidas: 0,
  faturado: 0,
  vendasCanceladas: 0,
  valorCancelado: 0,
  devolucoes: 0,
  receitaLiquida: 0,
  ticketMedio: 0,
  taxaCancelamento: 0,
}

export function metricasDeRpc(row: KpisVendasRpcRow | null | undefined): MetricasVendas {
  if (!row) return METRICAS_VENDAS_VAZIAS
  return {
    vendasRegistradas: num(row.vendas_registradas),
    vendasConcluidas: num(row.vendas_concluidas),
    faturado: num(row.faturado),
    vendasCanceladas: num(row.vendas_canceladas),
    valorCancelado: num(row.valor_cancelado),
    devolucoes: num(row.devolucoes),
    receitaLiquida: num(row.receita_liquida),
    ticketMedio: num(row.ticket_medio),
    taxaCancelamento: num(row.taxa_cancelamento),
  }
}
