import { z } from 'zod'
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

/**
 * Validação ESTRUTURAL apenas (transporte + forma do payload).
 *
 * Este schema NÃO decide aceitação financeira. Toda regra de negócio monetária
 * — preço, EPS, âncora de catálogo, vendabilidade, soma de pagamentos vs total,
 * total líquido positivo, sinal de valores — vive exclusivamente no PostgreSQL
 * (finalizar_venda_transacional_canonica_v3, migrations 235/236), dentro da
 * transação e sem caminho de bypass. Os campos numéricos abaixo usam `.finite()`
 * (rejeita NaN/Infinity/null/não-número) — corrupção de payload, não regra de
 * negócio. As únicas exceções deliberadas são guardas estruturais ainda NÃO
 * espelhadas no SQL (quantidade > 0 e ≤ 3 casas; percentual de gerente 0–100),
 * mantidas para não abrir buraco enquanto não são portadas ao banco.
 */
export const itemFinalizarVendaSchema = z.object({
  produtoId: z.string().uuid('Identificador do produto inválido.'),
  quantidade: z
    .number()
    .positive('A quantidade de cada item deve ser maior que zero.')
    .refine(quantidadeAte3CasasDecimais, {
      message: 'Use no máximo 3 casas decimais na quantidade (ex.: balança 0,125 kg).',
    }),
  /** Referência de varejo (ex.: bruto da linha); para ATACADO costuma ser o preço de tabela varejo. */
  precoOriginal: z.number().finite('preço original inválido.'),
  precoUnitario: z.number().finite('preço unitário inválido.'),
  tipoPreco: z.enum(TIPO_PRECO_ITEM_FINALIZAR, {
    errorMap: () => ({ message: 'Tipo de preço do item inválido.' }),
  }),
})

export const pagamentoParcelaSchema = z.object({
  formaPagamento: z.enum(FORMAS_PAGAMENTO_CAIXA, {
    errorMap: () => ({ message: 'Forma de pagamento inválida.' }),
  }),
  valor: z.number().finite('Valor da parcela inválido.'),
})

export const finalizarVendaInputSchema = z.object({
  /** Opcional: UUID estável por tentativa de finalização (fluxo unificado); vira `p_venda_id` e evita duplicar venda em retry/duplo clique. */
  idempotencyKey: z.string().uuid().optional(),
  formaPagamento: z.enum(FORMAS_PAGAMENTO_CAIXA, {
    errorMap: () => ({ message: 'Forma de pagamento inválida.' }),
  }),
  totalBruto: z.number().finite('Total bruto inválido.'),
  totalDesconto: z.number().finite('Total de desconto inválido.'),
  totalLiquido: z.number().finite('Total líquido inválido.'),
  descontoGerenteToken: z.string().min(1).optional(),
  descontoGerentePercentual: z
    .number()
    .positive('O desconto do gerente deve ser maior que zero.')
    .max(100, 'O desconto do gerente não pode passar de 100%.')
    .optional(),
  pagamentos: z.array(pagamentoParcelaSchema).min(1, 'Informe ao menos uma parcela de pagamento.'),
  itens: z.array(itemFinalizarVendaSchema).min(1, 'Inclua pelo menos um item na venda.'),
}).superRefine((value, ctx) => {
  // Consistência ESTRUTURAL do payload (par token↔percentual). Não é decisão
  // financeira: apenas garante que os dois campos viajem juntos ou ausentes.
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

/**
 * Aritmética pura de totais (sem decisão de aceitação): soma linhas para compor
 * os parâmetros p_total_* da RPC e alimentar gates de autorização. O total
 * persistido é recomputado e revalidado pelo PostgreSQL (v2), que é a autoridade.
 */
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
