/** Formata quantidade de estoque (até 3 casas, locale pt-BR). */
export function fmtQuantidadeEstoque(n: number): string {
  return Number(n).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  })
}
