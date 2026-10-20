import type { FinanceiroRecebivel } from './financeiroLojaTypes'

/** Status de exibição. "vencido" é derivado (PENDENTE com previsão < hoje): só exibição, nada é gravado. */
export type RecebivelStatusExibicao = 'pendente' | 'vencido' | 'recebido' | 'cancelado'

export function statusExibicaoRecebivel(r: Pick<FinanceiroRecebivel, 'status' | 'previsao'>, hoje: string): RecebivelStatusExibicao {
 if (r.status === 'RECEBIDO') return 'recebido'
 if (r.status === 'CANCELADO') return 'cancelado'
 const prev = (r.previsao ?? '').slice(0, 10)
 if (prev && /^\d{4}-\d{2}-\d{2}$/.test(prev) && prev < hoje.slice(0, 10)) return 'vencido'
 return 'pendente'
}

/** Mapeia para as chaves de tom do StatusChip existente. */
export const STATUS_CHIP_RECEBIVEL: Record<RecebivelStatusExibicao, string> = {
 pendente: 'PENDENTE',
 vencido: 'ERRO',
 recebido: 'CONCLUIDA',
 cancelado: 'FECHADO',
}

export type ResumoRecebiveis = {
 total: number; recebido: number; aberto: number; vencido: number
 qtdTotal: number; qtdRecebido: number; qtdAberto: number; qtdVencido: number
}

const centavos = (v: number) => Math.round((Number(v) || 0) * 100)

/** Totais sobre o conjunto completo (líquido estimado da RPC; cancelados ficam de fora). "Em aberto" inclui os vencidos. */
export function resumirRecebiveis(rows: Pick<FinanceiroRecebivel, 'status' | 'previsao' | 'liquido'>[], hoje: string): ResumoRecebiveis {
 let total = 0, recebido = 0, aberto = 0, vencido = 0, qtdTotal = 0, qtdRecebido = 0, qtdAberto = 0, qtdVencido = 0
 for (const r of rows) {
  const s = statusExibicaoRecebivel(r, hoje)
  if (s === 'cancelado') continue
  const c = centavos(r.liquido)
  total += c; qtdTotal++
  if (s === 'recebido') { recebido += c; qtdRecebido++ } else { aberto += c; qtdAberto++ }
  if (s === 'vencido') { vencido += c; qtdVencido++ }
 }
 return { total: total / 100, recebido: recebido / 100, aberto: aberto / 100, vencido: vencido / 100, qtdTotal, qtdRecebido, qtdAberto, qtdVencido }
}

/** Linhas para o CSV (valores numéricos crus com ponto, datas ISO: o CSV é para planilha). */
export function linhasCsvRecebiveis(rows: FinanceiroRecebivel[], hoje: string, rotuloStatus: Record<RecebivelStatusExibicao, string>) {
 return rows.map(r => ({
  venda_id: r.venda_id,
  meio: r.forma,
  parcela: `${r.parcela}/${r.parcelas}`,
  bruto: Number(r.bruto).toFixed(2),
  taxa: r.taxa === null ? '' : Number(r.taxa).toFixed(2),
  liquido_estimado: Number(r.liquido).toFixed(2),
  previsao: r.previsao ?? '',
  operadora: r.operadora ?? '',
  status: rotuloStatus[statusExibicaoRecebivel(r, hoje)],
  devolucao: r.devolucao ? 'sim' : '',
 }))
}
