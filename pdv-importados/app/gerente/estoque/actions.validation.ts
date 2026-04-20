import { z } from 'zod'

export const MotivoAjusteEstoqueSchema = z.enum(
  ['COMPRA', 'PERDA', 'QUEBRA', 'ACERTO_INVENTARIO', 'OUTRO'],
  { errorMap: () => ({ message: 'Motivo de ajuste inválido.' }) },
)

export const AtualizarEstoqueSchema = z.object({
  produto_id: z.string().uuid('Produto inválido.'),
  quantidade_atual: z.coerce.number().min(0, 'Quantidade atual não pode ser negativa.'),
  estoque_minimo: z.coerce.number().min(0, 'Estoque mínimo não pode ser negativo.'),
  motivo: MotivoAjusteEstoqueSchema,
  observacao: z
    .string()
    .trim()
    .max(500, 'Observação muito longa (máx. 500 caracteres).')
    .optional()
    .default(''),
}).superRefine((data, ctx) => {
  if (data.motivo === 'OUTRO' && !data.observacao) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['observacao'],
      message: 'Observação é obrigatória quando o motivo for OUTRO.',
    })
  }
})

export const ProdutoIdSchema = z.object({
  produto_id: z.string().uuid('Produto inválido.'),
})
