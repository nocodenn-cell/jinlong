/**
 * Regras de totais do cupom de venda — fonte única para o HTML (`CaixaReciboModal`)
 * e para o ESC/POS (`lib/thermal-printer/escpos.ts`).
 */

type DescontosRecibo = Readonly<{
  totalDesconto: number
  valorDescontoGerente: number
}>

/**
 * Parte do desconto que veio das LINHAS (faixa de atacado / preço manual).
 * `totalDesconto` já embute o desconto do gerente, então subtraí-lo evita listar
 * o mesmo valor duas vezes no cupom ("Desconto produtos" + "Desconto gerente").
 */
export function descontoProdutosLiquido(venda: DescontosRecibo): number {
  return Math.max(0, Number((venda.totalDesconto - venda.valorDescontoGerente).toFixed(2)))
}
