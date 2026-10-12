/** Dia civil America/Sao_Paulo (UTC−3, sem horário de verão desde 2019). */
const DIA = /^(\d{4})-(\d{2})-(\d{2})$/

export const TIPOS_MOVIMENTO_FILTRO = [
  'SAIDA_VENDA',
  'ENTRADA_DEVOLUCAO_CLIENTE',
  'ENTRADA_CANCELAMENTO_VENDA',
  'ENTRADA_NFE',
  'ENTRADA_OC',
  'ENTRADA_AJUSTE',
  'SAIDA_AJUSTE',
  'SAIDA_AVARIA',
  'TRANSFERENCIA_ENTRADA',
  'TRANSFERENCIA_SAIDA',
  'ENTRADA_REMESSA_LOJA',
  'PERDA',
  'QUEBRA',
  'VENDA',
  'COMPRA',
  'ENTRADA_NF',
  'ENTRADA',
  'SAIDA',
  'AJUSTE',
  'ACERTO_INVENTARIO',
  'DEVOLUCAO',
  'TRANSFERENCIA',
  'OUTRO',
] as const

export type PeriodoMovimento = { de: string | null; ate: string | null }

function diaValido(raw: string | undefined): string | null {
  const match = DIA.exec(raw ?? '')
  if (!match) return null
  const ano = Number(match[1])
  const mes = Number(match[2])
  const dia = Number(match[3])
  const data = new Date(Date.UTC(ano, mes - 1, dia))
  const mesmoDia =
    data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia
  return mesmoDia ? `${match[1]}-${match[2]}-${match[3]}` : null
}

export function normalizarPeriodoMovimento(de: string | undefined, ate: string | undefined): PeriodoMovimento {
  const inicio = diaValido(de)
  const fim = diaValido(ate)
  if (inicio && fim && inicio > fim) return { de: fim, ate: inicio }
  return { de: inicio, ate: fim }
}

export function tipoMovimentoFiltro(raw: string | undefined): string | null {
  if (!raw) return null
  return (TIPOS_MOVIMENTO_FILTRO as readonly string[]).includes(raw) ? raw : null
}

/** 00:00 inclusive no fuso de São Paulo, em ISO UTC. */
export function inicioDiaSaoPauloIso(dia: string): string {
  const [ano, mes, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, d, 3, 0, 0, 0)).toISOString()
}

/** 23:59:59.999 inclusive no fuso de São Paulo, em ISO UTC. */
export function fimDiaSaoPauloIso(dia: string): string {
  const [ano, mes, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, d + 1, 2, 59, 59, 999)).toISOString()
}
