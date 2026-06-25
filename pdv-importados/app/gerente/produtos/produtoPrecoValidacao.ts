import { z } from 'zod'

/**
 * Coerência preço atacado × varejo: o preço de atacado, quando informado, deve
 * ser estritamente menor que o de varejo. Caso contrário o "atacado" nunca
 * representaria desconto. Compartilhado por NovoProduto e EditarCatalogo.
 *
 * Vive fora de actions.ts porque aquele módulo é `'use server'` (só pode
 * exportar funções async) e esta regra pura precisa ser importável e testável.
 */
export function refinePrecoAtacadoMenorQueVarejo(
  data: { preco_atacado: number | null; preco_varejo: number },
  ctx: z.RefinementCtx,
): void {
  if (data.preco_atacado !== null && data.preco_atacado >= data.preco_varejo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['preco_atacado'],
      message: 'O preço de atacado deve ser menor que o preço de varejo.',
    })
  }
}
