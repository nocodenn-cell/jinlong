/**
 * S9 (G-01) — histórico de fechamento de caixa. Funções puras, fora de
 * `'use server'`, para serem testáveis sem montar Server Action/Supabase.
 */

import { roundMoney2 } from '@/shared/cart/totals'

/**
 * Deriva o "valor sistema" (esperado) de um caixa JÁ FECHADO a partir dos
 * dois campos persistidos no momento do fechamento — NUNCA recomputa via
 * `calcular_valor_sistema_dinheiro_caixa` para um turno passado.
 *
 * `fechar_caixa_atomico` (20260902100200_fechar_caixa_repeticao_valor_
 * divergente.sql) persiste `valor_fechamento` (contado) e
 * `fechamento_diferenca = contado - sistema`, calculados uma única vez, no
 * momento do fechamento. Esta é a mesma álgebra que a própria RPC usa no seu
 * ramo de replay (valor_fechamento - fechamento_diferenca) — recalcular ao
 * vivo poderia divergir do que foi de fato mostrado ao operador, se qualquer
 * dado relacionado (venda, sangria, devolução) mudar depois do fechamento.
 */
export function derivarValorSistemaFechamento(
  valorFechamento: number,
  fechamentoDiferenca: number,
): number {
  return roundMoney2(valorFechamento - fechamentoDiferenca)
}

function nomeRelacao(rel: unknown, campo: string): string | null {
  if (rel && typeof rel === 'object' && campo in rel) {
    const v = (rel as Record<string, unknown>)[campo]
    return v == null ? null : String(v)
  }
  return null
}

/** Mesma tolerância visual da tela: diferenças abaixo de 1 centavo não contam. */
export const TOLERANCIA_DIFERENCA = 0.009

export function temDiferenca(diferenca: number): boolean {
  return Math.abs(diferenca) > TOLERANCIA_DIFERENCA
}

export type CaixaHistoricoRaw = {
  id: string
  operador_id: string
  data_abertura: string
  data_fechamento: string | null
  valor_inicial: number
  valor_fechamento: number | null
  fechamento_diferenca: number | null
  fechamento_observacao: string | null
  turno_anterior_id?: string | null
  motivo_retomada?: string | null
  operador: unknown
}

export type CaixaHistoricoLinha = Readonly<{
  id: string
  operadorNome: string
  dataAbertura: string
  dataFechamento: string
  valorInicial: number
  valorSistema: number
  valorContado: number
  diferenca: number
  motivo: string | null
  /** Turno criado por retomada autorizada (`retomar_caixa_atomico`). */
  retomado: boolean
}>

function foiRetomado(row: { turno_anterior_id?: string | null; motivo_retomada?: string | null }): boolean {
  return row.turno_anterior_id != null || row.motivo_retomada != null
}

/**
 * Mapeia uma linha crua de `caixas` (já filtrada por `status = 'FECHADO'`)
 * para o DTO da tela. `null` quando os campos de fechamento não estão
 * presentes (defensivo — não deveria acontecer para status FECHADO, mas o
 * schema permite nullable) — nesse caso a linha é descartada pelo caller,
 * nunca exibida com valor inventado.
 */
export function mapCaixaHistoricoLinha(row: CaixaHistoricoRaw): CaixaHistoricoLinha | null {
  if (row.data_fechamento == null || row.valor_fechamento == null || row.fechamento_diferenca == null) {
    return null
  }
  return {
    id: row.id,
    operadorNome: nomeRelacao(row.operador, 'nome') ?? '—',
    dataAbertura: row.data_abertura,
    dataFechamento: row.data_fechamento,
    valorInicial: row.valor_inicial,
    valorSistema: derivarValorSistemaFechamento(row.valor_fechamento, row.fechamento_diferenca),
    valorContado: row.valor_fechamento,
    diferenca: row.fechamento_diferenca,
    motivo: row.fechamento_observacao,
    retomado: foiRetomado(row),
  }
}

export type CaixaAbertoRaw = {
  id: string
  operador_id: string
  data_abertura: string
  valor_inicial: number
  turno_anterior_id?: string | null
  motivo_retomada?: string | null
  operador: unknown
}

export type CaixaAbertoLinha = Readonly<{
  id: string
  operadorNome: string
  dataAbertura: string
  valorInicial: number
  /** Soma das sangrias APROVADAS do turno (pendentes/canceladas não entram). */
  sangrias: number
  /** Soma dos suprimentos APROVADOS do turno. */
  suprimentos: number
  retomado: boolean
}>

export type CaixaMovimentoAgregavelRaw = {
  caixa_id: string
  tipo: string
  valor: number
  status: string
}

/** O CHECK do banco grava `sangria`/`suprimento`/`estorno` em minúsculas. */
export function normalizarTipoMovimentacao(tipo: string): string {
  return tipo.trim().toUpperCase()
}

/**
 * Totais informativos de sangria/suprimento por turno, a partir de UMA
 * consulta em lote (`in('caixa_id', ids)`) — nunca N+1. Só movimentações
 * aprovadas contam. NÃO é o "esperado" do turno (ADR-CAIXA-002).
 */
export function agregarMovimentosPorCaixa(
  rows: readonly CaixaMovimentoAgregavelRaw[],
): Map<string, { sangrias: number; suprimentos: number }> {
  const porCaixa = new Map<string, { sangrias: number; suprimentos: number }>()
  for (const r of rows) {
    if (r.status.trim().toLowerCase() !== 'aprovado') continue
    const tipo = normalizarTipoMovimentacao(r.tipo)
    if (tipo !== 'SANGRIA' && tipo !== 'SUPRIMENTO') continue
    const acc = porCaixa.get(r.caixa_id) ?? { sangrias: 0, suprimentos: 0 }
    if (tipo === 'SANGRIA') acc.sangrias = roundMoney2(acc.sangrias + r.valor)
    else acc.suprimentos = roundMoney2(acc.suprimentos + r.valor)
    porCaixa.set(r.caixa_id, acc)
  }
  return porCaixa
}

export function mapCaixaAbertoLinha(
  row: CaixaAbertoRaw,
  totais: { sangrias: number; suprimentos: number } | undefined,
): CaixaAbertoLinha {
  return {
    id: row.id,
    operadorNome: nomeRelacao(row.operador, 'nome') ?? '—',
    dataAbertura: row.data_abertura,
    valorInicial: row.valor_inicial,
    sangrias: totais?.sangrias ?? 0,
    suprimentos: totais?.suprimentos ?? 0,
    retomado: foiRetomado(row),
  }
}

export type CaixaMovimentacaoRaw = {
  id: string
  tipo: string
  valor: number
  motivo: string
  status: string
  created_at: string
}

export type CaixaMovimentacaoLinha = Readonly<{
  id: string
  tipo: string
  valor: number
  motivo: string
  status: string
  criadaEm: string
}>

export function mapCaixaMovimentacaoLinha(row: CaixaMovimentacaoRaw): CaixaMovimentacaoLinha {
  return {
    id: row.id,
    tipo: row.tipo,
    valor: row.valor,
    motivo: row.motivo,
    status: row.status,
    criadaEm: row.created_at,
  }
}
