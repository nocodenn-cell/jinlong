import { z } from 'zod'
import { SALDO_PENDENTE_EPS } from '@/app/caixa/caixaPagamentoSaldo'
import { roundMoney2 } from '@/shared/cart/totals'
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

export const TIPO_PRECO_ITEM_FINALIZAR = ['VAREJO', 'ATACADO', 'MANUAL', 'PROMOCAO'] as const

export const MOTIVO_DESCONTO_ENUM = [
  'NAO_ESPECIFICADO',
  'ERRO_DIGITACAO',
  'NEGOCIACAO',
  'CLIENTE_PREFERENCIAL',
  'DANO_PRODUTO',
  'AUTORIZACAO_COMERCIAL',
  'OUTROS',
] as const

export const itemFinalizarVendaSchema = z.object({
  produtoId: z.string().uuid('Identificador do produto inválido.'),
  quantidade: z
    .number()
    .positive('A quantidade de cada item deve ser maior que zero.')
    .refine(quantidadeAte3CasasDecimais, {
      message: 'Use no máximo 3 casas decimais na quantidade (ex.: balança 0,125 kg).',
    }),
  /** Referência de varejo (ex.: bruto da linha); para ATACADO costuma ser o preço de tabela varejo. */
  precoOriginal: z.number().nonnegative('preço original inválido.'),
  precoUnitario: z.number().nonnegative('preço unitário inválido.'),
  tipoPreco: z.enum(TIPO_PRECO_ITEM_FINALIZAR, {
    errorMap: () => ({ message: 'Tipo de preço do item inválido.' }),
  }),
})

export const pagamentoParcelaSchema = z.object({
  formaPagamento: z.enum(FORMAS_PAGAMENTO_CAIXA, {
    errorMap: () => ({ message: 'Forma de pagamento inválida.' }),
  }),
  valor: z.number().positive('O valor da parcela deve ser maior que zero.'),
})

/** true quando a forma da venda e todas as parcelas são DINHEIRO (pré-condição do desconto de gerente). */
export function pagamentoSoDinheiro(v: {
  formaPagamento: string
  pagamentos: ReadonlyArray<{ formaPagamento: string }>
}): boolean {
  return v.formaPagamento === 'DINHEIRO' && v.pagamentos.every((p) => p.formaPagamento === 'DINHEIRO')
}

export const finalizarVendaInputSchema = z.object({
  /** Opcional: UUID estável por tentativa de finalização (fluxo unificado); vira `p_venda_id` e evita duplicar venda em retry/duplo clique. */
  idempotencyKey: z.string().uuid().optional(),
  formaPagamento: z.enum(FORMAS_PAGAMENTO_CAIXA, {
    errorMap: () => ({ message: 'Forma de pagamento inválida.' }),
  }),
  totalBruto: z.number().nonnegative('O total bruto não pode ser negativo.'),
  totalDesconto: z.number().nonnegative('O total de desconto não pode ser negativo.'),
  totalLiquido: z.number().positive('O total líquido deve ser maior que zero.'),
  descontoGerenteToken: z.string().min(1).optional(),
  descontoGerentePercentual: z
    .number()
    .positive('O desconto do gerente deve ser maior que zero.')
    .max(100, 'O desconto do gerente não pode passar de 100%.')
    .optional(),
  motivoDesconto: z.enum(MOTIVO_DESCONTO_ENUM).optional(),
  motivoDescontoDescricao: z.string().max(500).nullish(),
  /** BR-01: token de autorização gerencial para venda que excede o limite de crédito do cliente (`p_limite_credito_gerente_token`). */
  limiteCreditoGerenteToken: z.string().min(1).optional(),
  pagamentos: z.array(pagamentoParcelaSchema).min(1, 'Informe ao menos uma parcela de pagamento.'),
  itens: z.array(itemFinalizarVendaSchema).min(1, 'Inclua pelo menos um item na venda.'),
  clienteId: z.string().uuid('ID do cliente inválido.').optional(), // ✅ NOVO (Fase 5b)
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

  // Regra comercial: desconto percentual de gerente só existe em venda 100% dinheiro.
  if (hasToken && !pagamentoSoDinheiro(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['descontoGerenteToken'],
      message: 'O desconto de gerente só vale para venda paga totalmente em dinheiro.',
    })
  }

  if (value.motivoDesconto === 'OUTROS' && !value.motivoDescontoDescricao?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['motivoDescontoDescricao'],
      message: 'Descrição é obrigatória quando o motivo é "Outros".',
    })
  }
  if (value.motivoDesconto && value.motivoDesconto !== 'OUTROS' && value.motivoDescontoDescricao) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['motivoDescontoDescricao'],
      message: 'Descrição livre só é permitida quando o motivo é "Outros".',
    })
  }

  const somaPagamentos = roundMoney2(value.pagamentos.reduce((acc, p) => acc + p.valor, 0))

  if (somaPagamentos > roundMoney2(value.totalLiquido)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['pagamentos'],
      message: 'A soma das parcelas não pode exceder o total líquido.',
    })
  }

  if (somaPagamentos <= SALDO_PENDENTE_EPS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['pagamentos'],
      message: 'Informe um valor de pagamento maior que zero.',
    })
  }
})

export type FinalizarVendaInput = z.infer<typeof finalizarVendaInputSchema>
export type ItemTotalizacaoServidor = {
  precoOriginal: number
  precoUnitario: number
  quantidade: number
}

/**
 * Tipos de preco que representam decisao DISCRICIONARIA do operador sobre uma
 * linha. VAREJO e ATACADO nao entram: em ambos o servidor exige
 * `precoUnitario === calcular_preco_produto(...)` dentro de EPS_PRECO
 * (ver `recalcularItensNoServidor`), entao a linha nao carrega desconto
 * concedido pelo operador - ela carrega o preco de tabela vigente.
 */
const TIPOS_PRECO_DISCRICIONARIO = new Set(['MANUAL', 'PROMOCAO'])

/**
 * Parcela do desconto da venda que consome a alcada do operador.
 *
 * A faixa de atacado e regra comercial previamente cadastrada e revalidada no
 * servidor - nao e desconto concedido no balcao. Contar a diferenca
 * varejo->atacado aqui fazia toda venda de atacado acima do teto
 * (`desconto_maximo_operador_percentual`) exigir autorizacao gerencial, mesmo
 * sem o operador ter concedido nada.
 *
 * Desconto manual continua contando integralmente, entao o teto segue valendo
 * e nao da para usar uma linha de atacado para abrir espaco de desconto.
 */
export function descontoDiscricionarioFromItens(
  itens: ReadonlyArray<ItemTotalizacaoServidor & { tipoPreco?: string | null }>,
): number {
  const total = itens.reduce((acc, i) => {
    if (!TIPOS_PRECO_DISCRICIONARIO.has(String(i.tipoPreco ?? ''))) return acc
    const delta = i.precoOriginal - i.precoUnitario
    return delta > 0 ? acc + delta * i.quantidade : acc
  }, 0)
  return roundMoney2(total)
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
) {
  return (
    roundMoney2(computed.totalBruto) === roundMoney2(declared.totalBruto) &&
    roundMoney2(computed.totalLiquido) === roundMoney2(declared.totalLiquido) &&
    roundMoney2(computed.totalDesconto) === roundMoney2(declared.totalDesconto)
  )
}
