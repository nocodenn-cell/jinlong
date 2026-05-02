import { z } from 'zod'
import { roundMoney2 } from '../../../shared/cart/totals'
import { roundAbnt } from '@/core/money/roundAbnt'

export { roundMoney2 }

export const FORMAS_PAGAMENTO_CAIXA = [
  'DINHEIRO',
  'PIX',
  'CARTAO_DEBITO',
  'CARTAO_CREDITO',
] as const

function quantidadeAte3CasasDecimais(n: number): boolean {
  if (!Number.isFinite(n)) return false
  const r = roundAbnt(n, 3)
  return Math.abs(n - r) < 1e-9
}

export const itemFinalizarVendaSchema = z.object({
  produtoId: z.string().uuid('Identificador do produto inválido.'),
  quantidade: z
    .number()
    .positive('A quantidade de cada item deve ser maior que zero.')
    .refine(quantidadeAte3CasasDecimais, {
      message: 'Use no máximo 3 casas decimais na quantidade (ex.: balança 0,125 kg).',
    }),
})

export const pagamentoParcelaSchema = z.object({
  formaPagamento: z.enum(FORMAS_PAGAMENTO_CAIXA, {
    errorMap: () => ({ message: 'Forma de pagamento inválida.' }),
  }),
  valor: z.number().positive('O valor da parcela deve ser maior que zero.'),
})

export const finalizarVendaInputSchema = z.object({
  /** Opcional: UUID estável por tentativa de finalização (fluxo unificado); vira `p_venda_id` e evita duplicar venda em retry/duplo clique. */
  idempotencyKey: z.string().uuid().optional(),
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
  pagamentos: z.array(pagamentoParcelaSchema).min(1, 'Informe ao menos uma parcela de pagamento.'),
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

  const somaPagamentos = roundMoney2(value.pagamentos.reduce((acc, p) => acc + p.valor, 0))
  if (Math.abs(somaPagamentos - value.totalLiquido) > 0.01) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['pagamentos'],
      message: 'A soma das parcelas deve ser igual ao total líquido.',
    })
  }
})

export type FinalizarVendaInput = z.infer<typeof finalizarVendaInputSchema>
export type ItemTotalizacaoServidor = {
  precoOriginal: number
  precoUnitario: number
  quantidade: number
}

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
