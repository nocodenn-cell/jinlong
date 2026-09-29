/**
 * O ledger `venda_eventos` é append-only: cancelar uma venda NÃO remove o
 * `SALE_REGISTERED` original, apenas acrescenta um `SALE_CANCELLED` com o mesmo
 * total (ver `cancelar_venda_transacional`). `kpis_venda_eventos_gerente` soma por
 * tipo de evento, então uma venda cancelada dentro do período contava em
 * "concluídas/faturado" E em "canceladas". Aqui os cancelamentos do período são
 * abatidos de concluídas/faturado (visão de caixa: o estorno reduz o dia em que
 * ocorre). Contagens e faturado não ficam negativos quando o cancelamento cai em
 * período diferente do registro.
 */
export type KpisBrutos = Readonly<{
  faturado: number
  qtdConcluidas: number
  qtdCanceladas: number
  valorCanceladas: number
}>

export function liquidarKpis(b: KpisBrutos) {
  const faturado = Math.max(0, round2(b.faturado - b.valorCanceladas))
  const qtdConcluidas = Math.max(0, b.qtdConcluidas - b.qtdCanceladas)
  return {
    faturado,
    qtdConcluidas,
    ticketMedio: qtdConcluidas > 0 ? round2(faturado / qtdConcluidas) : 0,
    qtdCanceladas: b.qtdCanceladas,
    valorCanceladas: b.valorCanceladas,
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
