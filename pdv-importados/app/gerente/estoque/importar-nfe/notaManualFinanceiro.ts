type ItemFinanceiro = Readonly<{ q_com: number; v_un_com: number }>
type ParcelaFinanceira = Readonly<{ valor: number }>

export function valorEmCentavos(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100)
}

export function totalItensEmCentavos(itens: readonly ItemFinanceiro[]): number {
  return itens.reduce((total, item) => total + valorEmCentavos(item.q_com * item.v_un_com), 0)
}

export function totalParcelasEmCentavos(parcelas: readonly ParcelaFinanceira[]): number {
  return parcelas.reduce((total, parcela) => total + valorEmCentavos(parcela.valor), 0)
}

function parcelaValida(parcela: ParcelaFinanceira): boolean {
  const centavos = valorEmCentavos(parcela.valor)
  return Number.isSafeInteger(centavos) && centavos > 0 &&
    Math.abs(parcela.valor * 100 - centavos) < 0.000001
}

function itemValido(item: ItemFinanceiro): boolean {
  return Number.isFinite(item.q_com) && item.q_com > 0 &&
    Number.isFinite(item.v_un_com) && item.v_un_com > 0
}

export function erroFinanceiroNotaManual(
  itens: readonly ItemFinanceiro[], parcelas: readonly ParcelaFinanceira[],
): string | null {
  if (!itens.every(itemValido)) return 'Quantidade e valor unitário devem ser positivos e válidos.'
  if (parcelas.length === 0) return 'Informe ao menos uma parcela para gerar Contas a pagar.'
  if (!parcelas.every(parcelaValida)) return 'As parcelas devem ter valores positivos com até duas casas decimais.'
  const total = totalItensEmCentavos(itens)
  if (!Number.isSafeInteger(total) || total <= 0) return 'O total da nota deve ser positivo e válido.'
  if (total !== totalParcelasEmCentavos(parcelas)) return 'A soma das parcelas deve ser igual ao total dos produtos da nota.'
  return null
}
