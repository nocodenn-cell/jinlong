import { z } from 'zod'

export const FORMAS_PAGAMENTO_CAIXA = [
  'DINHEIRO',
  'PIX',
  'CARTAO_DEBITO',
  'CARTAO_CREDITO',
  'FIADO',
] as const

export const itemFinalizarVendaSchema = z.object({
  produtoId: z.string().uuid('Identificador do produto inválido.'),
  quantidade: z.number().positive('A quantidade de cada item deve ser maior que zero.'),
})

export const finalizarVendaInputSchema = z.object({
  formaPagamento: z.enum(FORMAS_PAGAMENTO_CAIXA, {
    errorMap: () => ({ message: 'Forma de pagamento inválida.' }),
  }),
  totalBruto: z.number().nonnegative('O total bruto não pode ser negativo.'),
  totalDesconto: z.number().nonnegative('O total de desconto não pode ser negativo.'),
  totalLiquido: z.number().nonnegative('O total líquido não pode ser negativo.'),
  descontoGerenteToken: z.string().min(1).optional(),
  descontoGerentePercentual: z
    .number()
    .positive('O desconto do gerente deve ser maior que zero.')
    .max(100, 'O desconto do gerente não pode passar de 100%.')
    .optional(),
  itens: z.array(itemFinalizarVendaSchema).min(1, 'Inclua pelo menos um item na venda.'),
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

export { roundMoney2 } from '@/core/cart/totals'
import { roundMoney2 } from '@/core/cart/totals'

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
