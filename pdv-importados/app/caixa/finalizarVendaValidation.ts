import { z } from 'zod'

export const FORMAS_PAGAMENTO_CAIXA = [
  'DINHEIRO',
  'PIX',
  'CARTAO_DEBITO',
  'CARTAO_CREDITO',
] as const

export const itemFinalizarVendaSchema = z.object({
  produtoId: z.string().uuid(),
  quantidade: z.number().positive(),
  precoOriginal: z.number().nonnegative(),
  precoUnitario: z.number().nonnegative(),
  descontoUnitario: z.number().nonnegative(),
  tipoPreco: z.enum(['VAREJO', 'ATACADO', 'MANUAL']),
})

export const finalizarVendaInputSchema = z.object({
  formaPagamento: z.enum(FORMAS_PAGAMENTO_CAIXA),
  totalBruto: z.number().nonnegative(),
  totalDesconto: z.number().nonnegative(),
  totalLiquido: z.number().nonnegative(),
  itens: z.array(itemFinalizarVendaSchema).min(1),
})

export type FinalizarVendaInput = z.infer<typeof finalizarVendaInputSchema>

export function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Igual ao `calcularTotais` do `carrinhoStore`: soma valores por linha sem arredondar, depois arredonda totais. */
export function totaisFromItens(itens: FinalizarVendaInput['itens']) {
  const bruto = itens.reduce((acc, i) => acc + i.precoOriginal * i.quantidade, 0)
  const liquido = itens.reduce((acc, i) => acc + i.precoUnitario * i.quantidade, 0)
  const desconto = bruto - liquido
  return {
    totalBruto: roundMoney2(bruto),
    totalLiquido: roundMoney2(liquido),
    totalDesconto: roundMoney2(desconto),
  }
}

export function totalsMatchDeclared(
  computed: ReturnType<typeof totaisFromItens>,
  declared: Pick<FinalizarVendaInput, 'totalBruto' | 'totalDesconto' | 'totalLiquido'>,
  epsilon = 0.02,
) {
  return (
    Math.abs(computed.totalBruto - declared.totalBruto) <= epsilon &&
    Math.abs(computed.totalLiquido - declared.totalLiquido) <= epsilon &&
    Math.abs(computed.totalDesconto - declared.totalDesconto) <= epsilon
  )
}
