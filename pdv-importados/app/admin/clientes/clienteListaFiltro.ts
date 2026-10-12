import { isTituloVencido } from '@shared-core/src/financial'

/** Mesmos status que `v_clientes_gerente` soma em saldo_crediario. */
const STATUS_SALDO_VIEW = new Set(['ABERTO', 'PARCIAL'])

export type TituloAbertoCliente = {
  cliente_id: string
  vencimento: string | null
  status: string
}

/**
 * Clientes com título em aberto (view) e vencimento anterior a hoje.
 * A data usa `isTituloVencido`. Título sem vencimento não entra — a venda
 * a prazo não grava essa data.
 */
export function clienteIdsComTituloVencido(rows: TituloAbertoCliente[], hoje: string): string[] {
  const ids = new Set<string>()
  for (const row of rows) {
    if (!tituloVencidoNaView(row, hoje)) continue
    ids.add(row.cliente_id)
  }
  return [...ids]
}

function tituloVencidoNaView(row: TituloAbertoCliente, hoje: string): boolean {
  if (!STATUS_SALDO_VIEW.has(row.status)) return false
  return isTituloVencido(row.vencimento, row.status, hoje)
}
