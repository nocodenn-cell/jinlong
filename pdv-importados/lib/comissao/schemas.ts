import { z } from 'zod'

/** Competência mensal AAAA-MM. */
export const compSchema = z.string().regex(/^\d{4}-\d{2}$/)

/**
 * Alvo por cargo: null = não é regra/meta por cargo. Texto vazio NÃO vira null
 * (viraria uma regra/meta da empresa inteira): é recusado.
 */
export const cargoSchema = z.string().trim().min(1, { message: 'Informe o cargo.' }).max(80).nullable()

const uuidOpt = z.string().uuid().nullable()
export const regraSchema = z
  .object({
    id: z.string().uuid().optional(),
    somenteEstaLoja: z.boolean(),
    usuarioId: uuidOpt,
    cargo: cargoSchema,
    produtoId: uuidOpt,
    categoriaId: uuidOpt,
    canal: z.enum(['VAREJO', 'ATACADO']).nullable(),
    tipoCalculo: z.enum(['percentual', 'fixo']),
    valor: z.number().finite().min(0),
    vigenciaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    vigenciaFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    ativo: z.boolean(),
    descricao: z.string().trim().max(200).nullable(),
  })
  .refine((r) => !(r.usuarioId && r.cargo), { message: 'Escolha funcionário OU cargo.' })
  .refine((r) => !(r.produtoId && r.categoriaId), { message: 'Escolha produto OU categoria.' })
  .refine((r) => r.tipoCalculo === 'fixo' || r.valor <= 100, { message: 'Percentual acima de 100%.' })
  .refine((r) => !r.vigenciaFim || r.vigenciaFim >= r.vigenciaInicio, { message: 'Fim da vigência antes do início.' })


export const metaSchema = z.object({
  id: z.string().uuid().optional(),
  usuarioId: z.string().uuid().nullable(),
  cargo: cargoSchema,
  competenciaInicio: compSchema,
  competenciaFim: compSchema.nullable(),
  faixas: z.array(z.object({ aPartirDe: z.number().finite().min(0), bonusPct: z.number().finite().min(0).max(100) })).min(1).max(10)
    .refine((fs) => fs.every((f, i) => i === 0 || f.aPartirDe > fs[i - 1].aPartirDe), { message: 'Faixas devem estar em ordem crescente.' }),
  ativo: z.boolean(),
  descricao: z.string().trim().max(200).nullable(),
}).refine((m) => !(m.usuarioId && m.cargo), { message: 'Escolha funcionário OU cargo.' })
  .refine((m) => !m.competenciaFim || m.competenciaFim >= m.competenciaInicio, { message: 'Fim antes do início.' })
