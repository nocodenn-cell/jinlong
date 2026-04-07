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
})

export const finalizarVendaInputSchema = z.object({
  formaPagamento: z.enum(FORMAS_PAGAMENTO_CAIXA),
  totalBruto: z.number().nonnegative(),
  totalDesconto: z.number().nonnegative(),
  totalLiquido: z.number().nonnegative(),
  descontoGerenteToken: z.string().min(1).optional(),
  descontoGerentePercentual: z.number().positive().max(100).optional(),
  itens: z.array(itemFinalizarVendaSchema).min(1),
}).superRefine((value, ctx) => {
  const hasToken = !!value.descontoGerenteToken
  const hasPercentual = value.descontoGerentePercentual !== undefined
  if (hasToken !== hasPercentual) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['descontoGerenteToken'],
      message: 'Token e percentual de desconto de gerente devem ser enviados juntos.',
    })
  }
})

export type FinalizarVendaInput = z.infer<typeof finalizarVendaInputSchema>
export type ItemTotalizacaoServidor = {
  precoOriginal: number
  precoUnitario: number
  quantidade: number
}

export function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Igual ao `calcularTotais` do `carrinhoStore`: soma valores por linha sem arredondar, depois arredonda totais. */
export function totaisFromItens(itens: ItemTotalizacaoServidor[]) {
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
