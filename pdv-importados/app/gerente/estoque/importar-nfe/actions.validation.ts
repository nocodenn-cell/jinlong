import { z } from 'zod'

export const ImportNfeLinhaSchema = z
  .object({
    nome_produto: z.string().min(1),
    gtin: z.string().nullable(),
    ref_fornecedor: z.string().min(1),
    ncm: z.string().nullable(),
    u_com: z.string().nullable(),
    q_com: z.number().nonnegative(),
    v_un_com: z.number().nonnegative(),
    fator: z.number().positive(),
    atualizar_custo: z.boolean(),
    // Resolução decidida na conferência: VINCULAR usa produto_id_destino;
    // CRIAR cadastra um produto novo a partir dos dados do XML.
    acao: z.enum(['VINCULAR', 'CRIAR']),
    produto_id_destino: z.string().uuid().nullable(),
  })
  .refine(
    (l) => (l.acao === 'VINCULAR' ? l.produto_id_destino !== null : l.produto_id_destino === null),
    {
      message: 'Item não resolvido: vincule a um produto ou marque para cadastrar como novo.',
      path: ['produto_id_destino'],
    },
  )

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

/**
 * FLX-05 — conferência antes de creditar estoque/custo da NF-e.
 * `item_id` é `importacoes_nfe_itens.id` (obtido via `obterConferenciaImportacaoNfe`).
 */
export const ConferenciaNfeItemSchema = z.object({
  item_id: z.string().uuid(),
  quantidade_conferida: z.number().nonnegative(),
  divergencia_obs: z.string().trim().min(1).nullable(),
})

export const RegistrarConferenciaNfePayloadSchema = z.object({
  importacao_id: z.string().uuid(),
  itens: z.array(ConferenciaNfeItemSchema).min(1),
})

export type RegistrarConferenciaNfePayloadInput = z.infer<
  typeof RegistrarConferenciaNfePayloadSchema
>

export const ConfirmarImportacaoNfePayloadSchema = z.object({
  importacao_id: z.string().uuid(),
})

export type ConfirmarImportacaoNfePayloadInput = z.infer<
  typeof ConfirmarImportacaoNfePayloadSchema
>
