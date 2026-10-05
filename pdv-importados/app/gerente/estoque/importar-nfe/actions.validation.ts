import { z } from 'zod'
import { erroFinanceiroNotaManual } from './notaManualFinanceiro'

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
  origem_manual: z.boolean().optional(),
  chave_acesso: z.string().length(44),
  numero_nf: z.string().nullable(),
  emitente_cnpj: z.string().regex(/^\d{14}$/),
  emitente_nome: z.string().min(1),
  atualizar_custo_padrao: z.boolean(),
  linhas: z.array(ImportNfeLinhaSchema).min(1),
  duplicatas: z.array(ImportNfeDuplicataSchema).default([]),
}).superRefine((nota, ctx) => {
  if (!nota.origem_manual && !nota.chave_acesso.startsWith('MANUAL')) return
  const erro = erroFinanceiroNotaManual(nota.linhas, nota.duplicatas)
  if (erro) ctx.addIssue({ code: z.ZodIssueCode.custom, message: erro, path: ['duplicatas'] })
})

export type ImportNfePayloadInput = z.infer<typeof ImportNfePayloadSchema>

/**
 * FLX-05 — conferência antes de creditar estoque/custo da NF-e.
 * `item_id` é `importacoes_nfe_itens.id` (obtido via `obterConferenciaImportacaoNfe`).
 */
export const ConferenciaNfeItemSchema = z.object({
  item_id: z.string().uuid(),
  // .finite() é deliberado, não redundante com .nonnegative(): Postgres numeric
  // trata NaN/Infinity como maiores que qualquer valor finito em comparação
  // direta (NaN > 0 é verdadeiro), então um guard só de sinal não barra esses
  // valores no banco — mesma classe de defeito que a migration D0-03 fechou
  // para remessas. Barrado aqui, na borda, além do guard espelhado na RPC.
  quantidade_conferida: z.number().nonnegative().finite(),
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

/**
 * Nota digitada à mão (sem XML): o balcão recebeu a mercadoria com a nota em papel
 * ou o fornecedor não mandou o XML. Vira o mesmo `NfeParsed` do XML e segue o fluxo
 * normal (vínculo de produtos → conferência → entrada de estoque + contas a pagar).
 * Chave de acesso é opcional: sem ela o servidor gera um identificador interno.
 */
export const NotaManualSchema = z.object({
  emitente_nome: z.string().trim().min(1, 'Informe o nome do fornecedor.'),
  emitente_cnpj: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v.length === 14, 'Informe o CNPJ do fornecedor com 14 dígitos.'),
  numero_nf: z.string().trim().min(1, 'Informe o número da nota.'),
  serie: z.string().trim().optional(),
  chave_acesso: z
    .string()
    .optional()
    .transform((v) => (v ?? '').replace(/\D/g, ''))
    .refine((v) => v === '' || v.length === 44, 'A chave de acesso deve ter 44 dígitos (ou fique em branco).'),
  itens: z
    .array(
      z.object({
        nome_produto: z.string().trim().min(1, 'Todo item precisa de descrição.'),
        produto_id: z.string().uuid().optional(),
        ref_fornecedor: z.string().trim().optional(),
        gtin: z
          .string()
          .optional()
          .transform((v) => (v ?? '').replace(/\D/g, ''))
          .refine((v) => v === '' || (v.length >= 8 && v.length <= 14), 'GTIN deve ter de 8 a 14 dígitos.'),
        ncm: z
          .string()
          .optional()
          .transform((v) => (v ?? '').replace(/\D/g, ''))
          .refine((v) => v === '' || v.length === 8, 'NCM deve ter 8 dígitos.'),
        u_com: z.string().trim().max(6).optional(),
        q_com: z.number().positive('Quantidade deve ser maior que zero.').finite(),
        v_un_com: z.number().positive('Valor unitário deve ser maior que zero.').finite(),
      }),
    )
    .min(1, 'Adicione ao menos um item.'),
  duplicatas: z
    .array(
      z.object({
        numero: z.string().trim().nullable().optional(),
        data_vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Vencimento inválido.'),
        valor: z.number().positive('Valor da parcela deve ser maior que zero.').finite(),
      }),
    )
    .min(1, 'Escolha a condição de pagamento para gerar Contas a pagar.'),
}).superRefine((nota, ctx) => {
  const erro = erroFinanceiroNotaManual(nota.itens, nota.duplicatas)
  if (erro) ctx.addIssue({ code: z.ZodIssueCode.custom, message: erro, path: ['duplicatas'] })
})

export type NotaManualInput = z.input<typeof NotaManualSchema>
