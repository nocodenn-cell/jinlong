import { z } from 'zod'

export const optionalTexto = (max: number) =>
  z.string().nullable().optional().transform((s) => {
    const t = (s ?? '').trim()
    return t.length === 0 ? null : t.slice(0, max)
  })

/** `produtos.codigo_interno` é `varchar(50)` (mig. 20260816135000). */
export const CODIGO_INTERNO_MAX = 50

/**
 * SKU: vazio → null; acima do limite da coluna → ERRO. Antes usava
 * `optionalTexto(60)`, que truncava em silêncio em 60 — acima do `varchar(50)`
 * do banco (o valor passava na validação e estourava no INSERT/UPDATE) e, em
 * qualquer caso, alterava o SKU digitado sem avisar.
 */
export const codigoInternoField = z
  .string()
  .nullable()
  .optional()
  .transform((s) => {
    const t = (s ?? '').trim()
    return t.length === 0 ? null : t
  })
  .refine(
    (s) => s === null || s.length <= CODIGO_INTERNO_MAX,
    `O código interno (SKU) deve ter no máximo ${CODIGO_INTERNO_MAX} caracteres.`,
  )

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
  codigo_interno: codigoInternoField,
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
  // Onda C2.6 (prontidão Focus NFe): código de origem ICMS ('0'..'8'), SEM
  // default (mesmo padrão de ncm/cfop/cest acima) — não deriva de `origem`.
  icms_origem: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v?.trim() || null)
    .refine(
      (s) => s === null || ['0', '1', '2', '3', '4', '5', '6', '7', '8'].includes(s),
      'Origem ICMS inválida (deve ser um código de 0 a 8).',
    ),
})

/** SSOT — campos compartilhados entre criar e editar produto. */
export const ProdutoFormBaseSchema = produtoFormBaseObject.superRefine(precoAtacadoRefine)

const estoqueInicialCadastroFields = {
  estoque_inicial_quantidade: z.coerce
    .number()
    .min(0, 'Estoque inicial não pode ser negativo.')
    .optional()
    .default(0),
  estoque_inicial_minimo: z.coerce
    .number()
    .min(0, 'Estoque mínimo não pode ser negativo.')
    .optional()
    .default(0),
  client_request_id: z.string().uuid().nullable().optional(),
}

export const NovoProdutoRascunhoSchema = produtoFormBaseObject
  .extend({
    preco_varejo: z.coerce
      .number()
      .nonnegative('O preço de varejo não pode ser negativo.')
      .default(0),
    status_publicacao: z.literal('DRAFT'),
    ...estoqueInicialCadastroFields,
  })
  .superRefine(precoAtacadoRefine)

export const NovoProdutoSchema = produtoFormBaseObject
  .extend({
    ativo: z.boolean().optional(),
    status_publicacao: z.enum(['DRAFT', 'PUBLICADO', 'INATIVO']).optional(),
    ...estoqueInicialCadastroFields,
  })
  .superRefine(precoAtacadoRefine)

export const EditarProdutoRascunhoSchema = produtoFormBaseObject
  .extend({
    produto_id: z.string().uuid('ID do produto inválido.'),
    preco_varejo: z.coerce
      .number()
      .nonnegative('O preço de varejo não pode ser negativo.')
      .default(0),
    status_publicacao: z.literal('DRAFT').optional(),
  })
  .superRefine(precoAtacadoRefine)

export const EditarProdutoCatalogoSchema = produtoFormBaseObject
  .extend({
    produto_id: z.string().uuid('ID do produto inválido.'),
  })
  .superRefine(precoAtacadoRefine)

export type ProdutoFormBaseValues = z.infer<typeof ProdutoFormBaseSchema>
