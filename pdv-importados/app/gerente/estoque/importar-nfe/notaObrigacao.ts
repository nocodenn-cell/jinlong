/**
 * SSOT-003 — espelho da regra de `confirmar_importacao_nfe`: nota com valor econômico > 0
 * e sem duplicatas não confirma o estoque. Só para a interface avisar antes; quem decide é o banco.
 */

export type ItemValorNota = { quantidade: number; custo_unitario: number }

export function valorEconomicoNota(itens: ItemValorNota[]): number {
  return itens.reduce((total, item) => total + (item.quantidade || 0) * (item.custo_unitario || 0), 0)
}

/** `true` quando a confirmação será recusada por falta de duplicatas. */
export function notaSemObrigacao(valorEconomico: number, duplicatasTotal: number): boolean {
  return valorEconomico > 0 && duplicatasTotal === 0
}
