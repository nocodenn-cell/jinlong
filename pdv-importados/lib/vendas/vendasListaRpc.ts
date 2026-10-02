/** Linha da lista de vendas exibida em /admin/vendas e no modal de cancelamento (uma por `vendas.id`). */
export type VendaListRow = {
  id: string
  data: string | null
  total_liquido: number | null
  total_bruto: number | null
  forma_pagamento: string | null
  status: string | null
  caixa_id: string | null
  operador_id: string | null
  qtd_itens_total: number
  qtd_itens_distintos: number
  primeiro_produto: string | null
}

/** Linha de `listar_vendas_gerente`: uma por `vendas.id`, com o estado atual da venda. */
export type RpcVendaRow = {
  venda_id: string
  status: string
  data: string
  total_liquido: number | string | null
  total_bruto: number | string | null
  forma_pagamento: string | null
  caixa_id: string
  operador_id: string | null
  qtd_itens_total: number | string | null
  qtd_itens_distintos: number | string | null
  primeiro_produto: string | null
}

/** `null` = sem filtro de status (todas as vendas, concluídas e canceladas). */
export function statusFromFiltro(status: ReadonlyArray<string>): string[] | null {
  const validos = status
    .map((s) => String(s).toUpperCase())
    .filter((s) => s === 'CONCLUIDA' || s === 'CANCELADA')
  return validos.length > 0 ? validos : null
}

/** O status exibido é o estado ATUAL da venda (`vendas.status`), nunca o tipo de um evento do ledger. */
export function mapVendaRow(raw: RpcVendaRow): VendaListRow {
  return {
    id: raw.venda_id,
    data: raw.data,
    total_liquido: raw.total_liquido == null ? null : Number(raw.total_liquido),
    total_bruto: raw.total_bruto == null ? null : Number(raw.total_bruto),
    forma_pagamento: raw.forma_pagamento,
    status: raw.status,
    caixa_id: raw.caixa_id,
    operador_id: raw.operador_id ?? null,
    qtd_itens_total: Number(raw.qtd_itens_total ?? 0),
    qtd_itens_distintos: Number(raw.qtd_itens_distintos ?? 0),
    primeiro_produto: raw.primeiro_produto,
  }
}
