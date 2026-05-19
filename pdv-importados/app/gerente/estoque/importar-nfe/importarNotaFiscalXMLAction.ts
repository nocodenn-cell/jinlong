'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteOuDono } from '@/lib/auth/gerenteOuDono'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import { parseNfeXmlFiscal, type NfeParsedFiscal } from '@/lib/nfe/nfeParserFiscal'

// ─── Types ────────────────────────────────────────────────────────────────────

type ActionOk<T> = { success: true; data: T }
type ActionErr   = { success: false; error: string }
type ActionResult<T = null> = ActionOk<T> | ActionErr

export type ResultadoImportacaoXML = {
  nota_fiscal_entrada_id: string
  itens_processados: number
  duplicatas_criadas: number
  parsed: {
    chave_acesso: string
    numero_nf: string | null
    emitente_nome: string
    emitente_cnpj: string
    totais: NfeParsedFiscal['totais']
    duplicatas: NfeParsedFiscal['duplicatas']
  }
}

// ─── Per-line overrides schema (optional) ─────────────────────────────────────

const LinhaOverrideSchema = z.object({
  ref_fornecedor:  z.string().min(1),
  fator:           z.number().positive().default(1),
  atualizar_custo: z.boolean().default(true),
})

const ImportarXMLInputSchema = z.object({
  xml_string:          z.string().min(10, 'XML inválido.'),
  atualizar_custo:     z.boolean().default(true),
  overrides:           z.array(LinhaOverrideSchema).default([]),
})

export type ImportarXMLInput = z.infer<typeof ImportarXMLInputSchema>

// ─── RPC error mapper ─────────────────────────────────────────────────────────

function mapRpcError(message: string): string {
  const map: Record<string, string> = {
    NFE_XML_AUTH:           'Sessão inválida. Faça login novamente.',
    NFE_XML_PERFIL:         'Sem permissão para importar NF-e.',
    NFE_XML_LOJA:           'Loja não autorizada para seu usuário.',
    NFE_XML_CNPJ_INVALIDO:  'CNPJ do emitente inválido.',
    NFE_XML_CHAVE_INVALIDA: 'Chave de acesso inválida (deve ter 44 dígitos).',
    NFE_XML_ITENS_VAZIO:    'Nenhum item para importar.',
    NFE_XML_DUPLICADA:      'Esta NF-e já foi importada (chave duplicada).',
    NFE_XML_REF_OBRIGATORIA:'Item sem código do fornecedor (cProd).',
    NFE_XML_FATOR_INVALIDO: 'Fator de conversão inválido (deve ser > 0).',
    NFE_XML_QTD_INVALIDA:   'Quantidade inválida na NF-e.',
    NFE_XML_QTD_ENTRADA_ZERO: 'Quantidade de entrada calculada = zero.',
    NFE_XML_CUSTO_INVALIDO: 'Preço/custo inválido.',
  }
  for (const [code, label] of Object.entries(map)) {
    if (message.includes(code)) return label
  }
  return mensagemErroComSecao('Importação NF-e XML', message)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function lojaIdDoUsuarioLogado(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('usuarios')
    .select('loja_id')
    .eq('id', user.id)
    .maybeSingle()
  return (data?.loja_id as string | undefined) ?? LOJA_MATRIZ_ID
}

// ─── Main server action ───────────────────────────────────────────────────────

/**
 * Importa uma NF-e completa a partir do XML bruto.
 * Executa a RPC `registrar_entrada_nfe_completa` em uma única transação:
 *   – autocadastro de fornecedor por CNPJ
 *   – matching De/Para e criação de produtos novos
 *   – incremento de estoque com CMV ponderado
 *   – injeção de duplicatas em contas_a_pagar
 */
export async function importarNotaFiscalXMLAction(
  input: ImportarXMLInput,
): Promise<ActionResult<ResultadoImportacaoXML>> {
  // 1. Auth
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  // 2. Validação de entrada
  const parsed = ImportarXMLInputSchema.safeParse(input)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join('; ')
    return { success: false, error: msg }
  }
  const { xml_string, atualizar_custo, overrides } = parsed.data

  // 3. Parse fiscal do XML
  let fiscal: NfeParsedFiscal
  try {
    fiscal = parseNfeXmlFiscal(xml_string)
  } catch (_e) {
    const msg = _e instanceof Error ? _e.message : 'Falha ao ler XML.'
    return { success: false, error: msg }
  }

  // 4. Loja do usuário
  const lojaId = await lojaIdDoUsuarioLogado()
  if (!lojaId) return { success: false, error: 'Não foi possível identificar sua loja.' }

  // 5. Montar payload de itens com overrides por ref_fornecedor
  const overrideMap = new Map(overrides.map((o) => [o.ref_fornecedor, o]))

  const itensJson = fiscal.itens.map((item) => {
    const ov = overrideMap.get(item.ref_fornecedor)
    return {
      nome_produto:    item.nome_produto,
      gtin:            item.gtin,
      ref_fornecedor:  item.ref_fornecedor,
      ncm:             item.ncm,
      u_com:           item.u_com,
      q_com:           item.q_com,
      v_un_com:        item.v_un_com,
      v_prod:          item.v_prod,
      v_icms:          item.v_icms,
      v_ipi:           item.v_ipi,
      v_st:            item.v_st,
      fator:           ov?.fator ?? 1,
      atualizar_custo: ov?.atualizar_custo ?? atualizar_custo,
    }
  })

  const duplicatasJson = fiscal.duplicatas.map((dup) => ({
    numero:     dup.numero,
    vencimento: dup.vencimento,
    valor:      dup.valor,
  }))

  const totaisJson = {
    v_nf:       fiscal.totais.v_nf,
    v_produtos: fiscal.totais.v_produtos,
    v_frete:    fiscal.totais.v_frete,
    v_icms:     fiscal.totais.v_icms,
    v_ipi:      fiscal.totais.v_ipi,
    v_st:       fiscal.totais.v_st,
    v_desconto: fiscal.totais.v_desconto,
  }

  // 6. Chamar RPC transacional
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('registrar_entrada_nfe_completa', {
    p_chave_acesso:    fiscal.chave_acesso,
    p_numero_nf:       fiscal.numero_nf ?? '',
    p_serie:           fiscal.serie ?? '',
    p_data_emissao:    fiscal.data_emissao,
    p_fornecedor_cnpj: fiscal.emitente.cnpj,
    p_fornecedor_nome: fiscal.emitente.nome,
    p_loja_id:         lojaId,
    p_totais:          totaisJson,
    p_itens:           itensJson,
    p_duplicatas:      duplicatasJson,
    p_atualizar_custo: atualizar_custo,
  })

  if (error) {
    return { success: false, error: mapRpcError(error.message) }
  }

  const row = data as {
    ok?: boolean
    nota_fiscal_entrada_id?: string
    itens_processados?: number
    duplicatas_criadas?: number
  } | null

  revalidatePath('/gerente/estoque')
  revalidatePath('/gerente/produtos')
  revalidatePath('/gerente/financeiro')

  return {
    success: true,
    data: {
      nota_fiscal_entrada_id: row?.nota_fiscal_entrada_id ?? '',
      itens_processados:      row?.itens_processados ?? 0,
      duplicatas_criadas:     row?.duplicatas_criadas ?? 0,
      parsed: {
        chave_acesso:  fiscal.chave_acesso,
        numero_nf:     fiscal.numero_nf,
        emitente_nome: fiscal.emitente.nome,
        emitente_cnpj: fiscal.emitente.cnpj,
        totais:        fiscal.totais,
        duplicatas:    fiscal.duplicatas,
      },
    },
  }
}
