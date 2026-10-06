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
  /** Saldo visto na UI ao abrir o modal — protege contra lost-update. */
  saldo_esperado: z.coerce.number().min(0).optional(),
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

export const EstoqueListagemInputSchema = z.object({
  visao: z.enum(['geral', 'critico']),
  busca: z.string().max(200).optional().default(''),
  categoria_id: z.string().uuid().nullable().optional(),
  origem: z.enum(['', 'china_manual', 'brasil_nf', 'brasil_sem_nf']).optional().default(''),
  ordem: z
    .enum(['nome', 'quantidade_atual', 'estoque_minimo', 'codigo_barras', 'deficit'])
    .optional()
    .default('nome'),
  dir_asc: z.boolean().optional().default(true),
  limite: z.coerce.number().int().min(1).max(500).optional().default(25),
  offset: z.coerce.number().int().min(0).optional().default(0),
})
