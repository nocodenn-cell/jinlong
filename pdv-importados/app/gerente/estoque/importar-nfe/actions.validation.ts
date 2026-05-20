import { z } from 'zod'

export const ImportNfeLinhaSchema = z.object({
  nome_produto: z.string().min(1),
  gtin: z.string().nullable(),
  ref_fornecedor: z.string().min(1),
  ncm: z.string().nullable(),
  u_com: z.string().nullable(),
  q_com: z.number().nonnegative(),
  v_un_com: z.number().nonnegative(),
  fator: z.number().positive(),
  atualizar_custo: z.boolean(),
})

const ImportNfeDuplicataSchema = z.object({
  numero: z.string().nullable(),
  data_vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  valor: z.number().positive(),
})

export const ImportNfePayloadSchema = z.object({
  chave_acesso: z.string().length(44),
  numero_nf: z.string().nullable(),
  emitente_cnpj: z.string().regex(/^\d{14}$/),
  emitente_nome: z.string().min(1),
  atualizar_custo_padrao: z.boolean(),
  linhas: z.array(ImportNfeLinhaSchema).min(1),
  duplicatas: z.array(ImportNfeDuplicataSchema).default([]),
})

export type ImportNfePayloadInput = z.infer<typeof ImportNfePayloadSchema>
