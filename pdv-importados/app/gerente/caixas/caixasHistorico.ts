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

export type CaixaHistoricoRaw = {
  id: string
  operador_id: string
  data_abertura: string
  data_fechamento: string | null
  valor_inicial: number
  valor_fechamento: number | null
  fechamento_diferenca: number | null
  fechamento_observacao: string | null
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
}>

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
