import { z } from 'zod'

export const optionalTexto = (max: number) =>
  z.string().nullable().optional().transform((s) => {
    const t = (s ?? '').trim()
    return t.length === 0 ? null : t.slice(0, max)
  })

const codigoBarrasField = z
  .string()
  .nullable()
  .optional()
  .transform((s) => {
    const t = (s ?? '').trim()
    return t.length === 0 ? null : t
  })
  .refine(
    (s) => s === null || s.length >= 3,
    'Código de barras: mínimo 3 caracteres ou deixe em branco',
  )

const precoAtacadoRefine = (
  data: { preco_varejo: number; preco_atacado: number | null },
  ctx: z.RefinementCtx,
) => {
  if (data.preco_atacado !== null && data.preco_atacado >= data.preco_varejo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['preco_atacado'],
      message: 'O preço de atacado deve ser menor que o preço de varejo.',
    })
  }
}

/** Objeto base — estendido por Create/Update antes do superRefine. */
const produtoFormBaseObject = z.object({
  nome: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres.'),
  codigo_barras: codigoBarrasField,
  codigo_interno: optionalTexto(60),
  referencia_fornecedor: optionalTexto(60),
  nome_reduzido_pdv: optionalTexto(40),
  localizacao_prateleira: optionalTexto(60),
  preco_varejo: z.coerce.number().positive('O preço de varejo deve ser maior que zero.'),
  preco_atacado: z.coerce
    .number()
    .positive('O preço de atacado deve ser maior que zero (ou deixe em branco).')
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  preco_custo: z.coerce
    .number()
    .nonnegative('O preço de custo não pode ser negativo.')
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  permitir_abaixo_custo: z.coerce.boolean().optional().transform((v) => v ?? false),
  quantidade_gatilho_atacado: z.coerce
    .number()
    .int()
    .min(1)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  /** Só é usado na criação (criarProdutoComEstoque); edição continua exigindo o
   *  fluxo auditado de ajuste em /admin/estoque. */
  estoque_minimo: z.coerce
    .number()
    .int()
    .nonnegative()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  origem: z.enum(['china_manual', 'brasil_nf', 'brasil_sem_nf'], {
    errorMap: () => ({ message: 'Origem do produto inválida.' }),
  }),
  tem_nf: z.coerce.boolean(),
  unidade_medida: z.enum(['UN', 'KG', 'CX', 'FD', 'M']).optional().default('UN'),
  observacao: z.string().nullable().optional().transform((v) => v?.trim() || null),
  categoria_id: z.string().uuid().nullable().optional().transform((v) => v || null),
  marca_id: z.string().uuid().nullable().optional().transform((v) => v || null),
  fornecedor_id: z.string().uuid().nullable().optional().transform((v) => v || null),
  ncm: z
    .string()
    .optional()
    .transform((s) => s?.trim().replace(/\D/g, '') || null)
    .refine((s) => s === null || /^\d{8}$/.test(s), 'NCM deve ter exatamente 8 dígitos.')
    .nullable(),
  cfop_produto: z
    .string()
    .optional()
    .transform((s) => s?.trim().replace(/\D/g, '') || null)
    .refine((s) => s === null || /^\d{4}$/.test(s), 'CFOP deve ter 4 dígitos.')
    .nullable(),
  csosn: z.string().nullable().optional().transform((v) => v?.trim() || null),
  cest: z
    .string()
    .optional()
    .transform((s) => s?.trim().replace(/\D/g, '') || null)
    .refine((s) => s === null || /^\d{7}$/.test(s), 'CEST deve ter 7 dígitos.')
    .nullable(),
  cst_pis: z.string().nullable().optional().transform((v) => v?.trim() || null),
  cst_cofins: z.string().nullable().optional().transform((v) => v?.trim() || null),
})

/** SSOT — campos compartilhados entre criar e editar produto. */
export const ProdutoFormBaseSchema = produtoFormBaseObject.superRefine(precoAtacadoRefine)

export const NovoProdutoSchema = produtoFormBaseObject
  .extend({
    ativo: z.boolean().optional(),
    status_publicacao: z.enum(['DRAFT', 'PUBLICADO', 'INATIVO']).optional(),
  })
  .superRefine(precoAtacadoRefine)

export const EditarProdutoCatalogoSchema = produtoFormBaseObject
  .extend({
    produto_id: z.string().uuid('ID do produto inválido.'),
  })
  .superRefine(precoAtacadoRefine)

export type ProdutoFormBaseValues = z.infer<typeof ProdutoFormBaseSchema>
