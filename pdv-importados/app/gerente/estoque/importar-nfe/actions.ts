'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import {
  mensagemErroComSecao,
  mensagemErroValidacaoZod,
} from '@/lib/errors/mensagemErroUsuario'
import { parseNfeXml, type NfeParsed } from '@/lib/nfe/nfeParser'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getGerenteLojaId } from '@/lib/gerente/auth/sessionContext'
import {
  ConfirmarImportacaoNfePayloadSchema,
  ImportNfePayloadSchema,
  NotaManualSchema,
  RegistrarConferenciaNfePayloadSchema,
} from './actions.validation'
import { createInventoryMovementWriter } from '@/app/admin/estoque/inventoryMovementWriter'
import { mensagemErroOc, type OcResumoRecebimento } from '@/app/gerente/compras/ocRecebimento'
import {
  carregarResumoOc,
  carregarSaldoOcItens,
  somaAtribuidaImportacao,
} from '@/app/gerente/compras/ocResumoQuery'

type ActionResult<T = null> =
  | { success: true; data: T }
  | { success: false; error: string }

async function lojaIdDoUsuarioLogado(): Promise<string | null> {
  return getGerenteLojaId()
}

function onlyDigits(s: string): string {
  return s.replace(/\D/g, '')
}

function mapRpcImportNfe(message: string): string {
  // UX-04 — pedido vinculado à NF-e: excesso sobre o saldo aborta a confirmação inteira.
  if (message.includes('OC_QTD_ACIMA_SALDO')) {
    return 'A quantidade conferida de um item é maior do que ainda falta receber do pedido vinculado. Nada foi lançado no estoque. Ajuste a quantidade conferida, escolha outro pedido ou desvincule o pedido.'
  }
  const erroOc = mensagemErroOc(message)
  if (erroOc) return erroOc
  if (message.includes('IMPORT_NFE_DUPLICATA_INVALIDA')) {
    return 'Uma das duplicatas (parcelas a pagar) desta NF-e está com data de vencimento ou valor inválido. Corrija a duplicata e importe novamente — nada foi gravado.'
  }
  if (message.includes('IMPORT_NFE_DUPLICADA')) {
    return 'Esta NF-e já foi importada (chave duplicada).'
  }
  if (message.includes('IMPORT_NFE_CHAVE_INVALIDA')) {
    return 'Chave de acesso inválida.'
  }
  if (message.includes('IMPORT_NFE_CNPJ_INVALIDO')) {
    return 'CNPJ do emitente inválido.'
  }
  if (message.includes('IMPORT_NFE_ITENS_VAZIO')) {
    return 'Nenhum item para importar.'
  }
  if (message.includes('IMPORT_NFE_AUTH')) {
    return 'Sessão inválida. Faça login novamente.'
  }
  if (message.includes('IMPORT_NFE_PERFIL')) {
    return 'Sem permissão para importar NF-e.'
  }
  if (message.includes('IMPORT_NFE_LOJA')) {
    return 'Loja não autorizada para seu usuário.'
  }
  if (message.includes('IMPORT_NFE_REF_OBRIGATORIA')) {
    return 'Item sem código do fornecedor (cProd).'
  }
  if (message.includes('IMPORT_NFE_DESTINO_INVALIDO')) {
    return 'Produto escolhido para vínculo não pertence à sua loja.'
  }
  if (message.includes('IMPORT_NFE_ITEM_NAO_RESOLVIDO')) {
    return 'Há item sem resolução (vincular ou cadastrar). Revise a conferência.'
  }
  if (message.includes('IMPORT_NFE_FATOR_INVALIDO')) {
    return 'Fator de conversão inválido.'
  }
  if (message.includes('IMPORT_NFE_QTD_INVALIDA')) {
    return 'Quantidade inválida na NF-e.'
  }
  if (message.includes('IMPORT_NFE_QTD_ENTRADA_ZERO')) {
    return 'Quantidade de entrada calculada zero.'
  }
  if (message.includes('IMPORT_NFE_CUSTO_INVALIDO')) {
    return 'Preço/custo inválido.'
  }
  if (message.includes('IMPORT_NFE_NAO_ENCONTRADA')) {
    return 'Importação não encontrada.'
  }
  if (message.includes('IMPORT_NFE_CONFERENCIA_QTD_INVALIDA')) {
    return 'Quantidade conferida inválida.'
  }
  if (message.includes('IMPORT_NFE_ITEM_NAO_ENCONTRADO')) {
    return 'Item da conferência não pertence a esta importação.'
  }
  if (message.includes('IMPORT_NFE_CONFERENCIA_PENDENTE')) {
    return 'Ainda há itens não conferidos. Registre a conferência de todos os itens antes de confirmar.'
  }
  if (message.includes('IMPORT_NFE_STATUS_INVALIDO')) {
    return 'Esta importação já foi confirmada anteriormente.'
  }
  if (
    message.includes('PRODUTO_VAREJO_ABAIXO_CUSTO') ||
    message.includes('PRODUTO_ATACADO_ABAIXO_CUSTO')
  ) {
    return 'O custo da nota ficaria acima do preço de varejo/atacado. Ajuste o preço no catálogo e tente confirmar de novo. O estoque ainda não foi creditado.'
  }
  return mensagemErroComSecao('Importação NF-e', message)
}

/** Estado de reconhecimento de cada item na conferência. */
export type StatusItemNfe = 'RECONHECIDO_DEPARA' | 'RECONHECIDO_EAN' | 'DESCONHECIDO'

export type LinhaPreviewNfe = {
  nome_produto: string
  gtin: string | null
  ref_fornecedor: string
  ncm: string | null
  u_com: string | null
  q_com: number
  v_un_com: number
  status_produto: StatusItemNfe
  /** Produto do catálogo já reconhecido (De-Para ou GTIN); null se desconhecido. */
  produto_id: string | null
  /** Nome do produto reconhecido, para exibir na conferência. */
  produto_nome: string | null
}

export type ProdutoVinculoOpcao = {
  id: string
  nome: string
  codigo_barras: string | null
  preco_custo: number | null
}

export async function previewImportacaoNfe(xml: string): Promise<
  ActionResult<{ parsed: NfeParsed; linhas: LinhaPreviewNfe[] }>
> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const lojaId = await lojaIdDoUsuarioLogado()
  if (!lojaId) return { success: false, error: 'Não foi possível identificar sua loja.' }

  let parsed: NfeParsed
  try {
    parsed = parseNfeXml(xml)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha ao ler XML.'
    // Só o sentinela da duplicata usa o texto amigável; as demais mensagens de
    // leitura do XML seguem cruas como antes.
    const duplicataInvalida = msg.includes('IMPORT_NFE_DUPLICATA_INVALIDA')
    return { success: false, error: duplicataInvalida ? mapRpcImportNfe(msg) : msg }
  }

  const supabase = await createClient()
  const linhas = await montarLinhasPreview(supabase, lojaId, parsed)
  return { success: true, data: { parsed, linhas } }
}

/**
 * Nota digitada sem XML: monta o mesmo `NfeParsed` e devolve o mesmo preview, de modo que
 * vínculo de itens, conferência, estoque e contas a pagar seguem exatamente o fluxo do XML.
 */
export async function previewNotaManualNfe(
  input: unknown,
): Promise<ActionResult<{ parsed: NfeParsed; linhas: LinhaPreviewNfe[] }>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const v = NotaManualSchema.safeParse(input)
  if (!v.success) {
    return { success: false, error: v.error.issues[0]?.message ?? 'Dados da nota inválidos.' }
  }

  const lojaId = await lojaIdDoUsuarioLogado()
  if (!lojaId) return { success: false, error: 'Não foi possível identificar sua loja.' }

  const n = v.data
  // Sem chave real: identificador interno de 44 caracteres (a coluna é UNIQUE e exige 44).
  const chave =
    n.chave_acesso ||
    `MANUAL${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`.slice(0, 44)
  const numero = n.serie ? `${n.numero_nf}/${n.serie}` : n.numero_nf

  const parsed: NfeParsed = {
    chave_acesso: chave,
    numero_nf: numero,
    emitente: { nome: n.emitente_nome, cnpj: n.emitente_cnpj },
    itens: n.itens.map((i) => ({
      nome_produto: i.nome_produto,
      gtin: i.gtin || null,
      ref_fornecedor: i.ref_fornecedor || i.gtin || i.nome_produto.slice(0, 60),
      ncm: i.ncm || null,
      u_com: i.u_com || 'UN',
      q_com: i.q_com,
      v_un_com: i.v_un_com,
    })),
    duplicatas: n.duplicatas.map((d) => ({
      numero: d.numero || null,
      data_vencimento: d.data_vencimento,
      valor: d.valor,
    })),
  }

  const supabase = await createClient()
  const linhas = await montarLinhasPreview(supabase, lojaId, parsed)
  return { success: true, data: { parsed, linhas } }
}

async function montarLinhasPreview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lojaId: string,
  parsed: NfeParsed,
): Promise<LinhaPreviewNfe[]> {
  const cnpj = onlyDigits(parsed.emitente.cnpj)

  const { data: forn } = await supabase
    .from('fornecedores')
    .select('id')
    .eq('loja_id', lojaId)
    .eq('cnpj', cnpj)
    .maybeSingle()
  const fornId = (forn?.id as string | undefined) ?? null

  const gtins = [
    ...new Set(
      parsed.itens.map((i) => i.gtin).filter((g): g is string => !!g && g.length >= 8),
    ),
  ]
  const refs = [...new Set(parsed.itens.map((i) => i.ref_fornecedor))]

  // (1) De-Para aprendido: [loja + fornecedor + ref] → produto
  const byDePara = new Map<string, { id: string; nome: string }>()
  if (fornId && refs.length > 0) {
    const { data: rows } = await supabase
      .from('vinculos_fornecedor_produto')
      .select('ref_fornecedor, produto_id, produtos(id, nome)')
      .eq('loja_id', lojaId)
      .eq('fornecedor_id', fornId)
      .in('ref_fornecedor', refs)
    for (const r of rows ?? []) {
      const ref = r.ref_fornecedor as string | null
      const rel = (r as { produtos: { id: string; nome: string } | { id: string; nome: string }[] | null }).produtos
      const prod = Array.isArray(rel) ? rel[0] : rel
      if (ref && prod) byDePara.set(ref, { id: prod.id, nome: prod.nome })
    }
  }

  // (2) Código de barras (cEAN) na loja
  const byGtin = new Map<string, { id: string; nome: string }>()
  if (gtins.length > 0) {
    const { data: rows } = await supabase
      .from('produtos')
      .select('id, nome, codigo_barras')
      .eq('loja_id', lojaId)
      .in('codigo_barras', gtins)
    for (const r of rows ?? []) {
      const cb = r.codigo_barras as string | null
      if (cb) byGtin.set(cb, { id: r.id as string, nome: r.nome as string })
    }
  }

  const linhas: LinhaPreviewNfe[] = parsed.itens.map((item) => {
    const dePara = byDePara.get(item.ref_fornecedor)
    const ean = item.gtin && item.gtin.length >= 8 ? byGtin.get(item.gtin) : undefined

    let status: StatusItemNfe = 'DESCONHECIDO'
    let produtoId: string | null = null
    let produtoNome: string | null = null

    if (dePara) {
      status = 'RECONHECIDO_DEPARA'
      produtoId = dePara.id
      produtoNome = dePara.nome
    } else if (ean) {
      status = 'RECONHECIDO_EAN'
      produtoId = ean.id
      produtoNome = ean.nome
    }

    return {
      nome_produto: item.nome_produto,
      gtin: item.gtin,
      ref_fornecedor: item.ref_fornecedor,
      ncm: item.ncm,
      u_com: item.u_com,
      q_com: item.q_com,
      v_un_com: item.v_un_com,
      status_produto: status,
      produto_id: produtoId,
      produto_nome: produtoNome,
    }
  })

  return linhas
}

/** Busca produtos do catálogo da loja para amarrar o De-Para de um item desconhecido. */
export async function buscarProdutosParaVinculo(
  termo: string,
): Promise<ActionResult<ProdutoVinculoOpcao[]>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const lojaId = await lojaIdDoUsuarioLogado()
  if (!lojaId) return { success: false, error: 'Não foi possível identificar sua loja.' }

  // Sanitiza para o filtro .or() do PostgREST (vírgula/percent são separadores/curinga).
  const t = termo.replace(/[%,()]/g, ' ').trim()
  if (t.length < 2) return { success: true, data: [] }

  const supabase = await createClient()
  const padrao = `%${t}%`
  const { data, error } = await supabase
    .from('produtos')
    .select('id, nome, codigo_barras, preco_custo')
    .eq('loja_id', lojaId)
    .eq('ativo', true)
    .or(`nome.ilike.${padrao},codigo_barras.ilike.${padrao},codigo_interno.ilike.${padrao}`)
    .order('nome', { ascending: true })
    .limit(10)

  if (error) {
    return { success: false, error: mensagemErroComSecao('Produtos', error.message) }
  }

  const rows = (data ?? []).map((r) => ({
    id: r.id as string,
    nome: r.nome as string,
    codigo_barras: (r.codigo_barras as string | null) ?? null,
    preco_custo: r.preco_custo != null ? Number(r.preco_custo) : null,
  }))
  return { success: true, data: rows }
}

function catalogR1DeployBlocked(): boolean {
  return process.env.CATALOG_R1_DEPLOY === '1'
}

export async function executarImportacaoNfe(
  input: unknown,
): Promise<
  ActionResult<{
    /** FLX-05: chave da etapa de conferência (`obterConferenciaImportacaoNfe`). Null só se a RPC não retornar (não deveria ocorrer). */
    importacao_id: string | null
    itens_processados: number
    produtos_novos: number
    produtos_vinculados: number
  }>
> {
  if (catalogR1DeployBlocked()) {
    return {
      success: false,
      error:
        'Importação NF-e temporariamente indisponível durante atualização do catálogo. Tente novamente em alguns minutos.',
    }
  }
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsedPayload = ImportNfePayloadSchema.safeParse(input)
  if (!parsedPayload.success) {
    const msg = parsedPayload.error.issues.map((i) => i.message).join('; ')
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod(msg, idioma) }
  }

  const lojaId = await lojaIdDoUsuarioLogado()
  if (!lojaId) return { success: false, error: 'Não foi possível identificar sua loja.' }

  const supabase = await createClient()
  const p = parsedPayload.data

  const itensJson = p.linhas.map((linha) => ({
    nome_produto: linha.nome_produto,
    gtin: linha.gtin,
    ref_fornecedor: linha.ref_fornecedor,
    ncm: linha.ncm,
    u_com: linha.u_com,
    q_com: linha.q_com,
    v_un_com: linha.v_un_com,
    fator: linha.fator,
    atualizar_custo: linha.atualizar_custo,
    acao: linha.acao,
    produto_id_destino: linha.produto_id_destino,
  }))

  const writer = createInventoryMovementWriter(supabase, lojaId)
  const result = await writer.importNfe({
    chaveAcesso: p.chave_acesso,
    numeroNf: p.numero_nf,
    fornecedorCnpj: p.emitente_cnpj,
    fornecedorNome: p.emitente_nome,
    lojaId,
    itens: itensJson,
    atualizarCusto: p.atualizar_custo_padrao,
    duplicatas: p.duplicatas.length > 0 ? p.duplicatas : null,
  })

  if (!result.ok) {
    return { success: false, error: mapRpcImportNfe(result.error) }
  }

  revalidatePath('/gerente/estoque')
  revalidatePath('/gerente/produtos')
  revalidatePath('/admin/catalogo')
  revalidatePath('/admin/estoque/importar-nfe')
  return {
    success: true,
    data: {
      importacao_id: result.importacaoId,
      itens_processados: result.itensProcessados,
      produtos_novos: result.produtosNovos,
      produtos_vinculados: result.produtosVinculados,
    },
  }
}

// ============================================================================
// FLX-05 — conferência antes de creditar estoque/custo. `importar_nfe_transacao`
// (acima) só cadastra/vincula catálogo e grava `importacoes_nfe_itens` em
// EM_CONFERENCIA. O crédito real de saldo/custo/contas_pagar só acontece depois
// que o operador confere a quantidade recebida item a item.
// ============================================================================

export type ItemConferenciaNfe = {
  item_id: string
  produto_id: string
  produto_nome: string
  produto_codigo_barras: string | null
  quantidade_nfe: number
  custo_unitario: number
  atualizar_custo: boolean
  quantidade_conferida: number | null
  divergencia_obs: string | null
  status_conferencia: 'EM_CONFERENCIA' | 'CONFERIDO' | 'DIVERGENTE'
}

/** Pedido que o OPERADOR escolheu relacionar à NF-e (nunca presumido). */
export type OrdemCompraVinculadaNfe = {
  oc_id: string
  fornecedor_nome: string | null
  status: string
  pedido_total: number
  recebido_total: number
  pendente_total: number
  /** Produtos da nota que não constam no pedido: entram no estoque, mas não abatem o pedido. */
  itens_fora_do_pedido: string[]
}

export type ConferenciaImportacaoNfe = {
  importacao_id: string
  status: 'EM_CONFERENCIA' | 'CONCLUIDA'
  numero_nf: string | null
  fornecedor_nome: string
  created_at: string
  itens: ItemConferenciaNfe[]
  ordem_compra: OrdemCompraVinculadaNfe | null
}

/** Lê uma importação (aberta ou já concluída) com seus itens para a tela de conferência. */
export async function obterConferenciaImportacaoNfe(
  importacaoId: string,
): Promise<ActionResult<ConferenciaImportacaoNfe>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const lojaId = await lojaIdDoUsuarioLogado()
  if (!lojaId) return { success: false, error: 'Não foi possível identificar sua loja.' }

  const supabase = await createClient()

  const { data: imp, error: impError } = await supabase
    .from('importacoes_nfe')
    .select('id, status, numero_nf, created_at, ordem_compra_id, fornecedores(nome)')
    .eq('id', importacaoId)
    .eq('loja_id', lojaId)
    .maybeSingle()

  if (impError) {
    return { success: false, error: mensagemErroComSecao('Importação NF-e', impError.message) }
  }
  if (!imp) {
    return { success: false, error: 'Importação não encontrada.' }
  }

  const { data: itens, error: itensError } = await supabase
    .from('importacoes_nfe_itens')
    .select(
      'id, produto_id, quantidade_nfe, custo_unitario, atualizar_custo, quantidade_conferida, divergencia_obs, status_conferencia, produtos(nome, codigo_barras)',
    )
    .eq('importacao_nfe_id', importacaoId)
    .order('created_at', { ascending: true })

  if (itensError) {
    return { success: false, error: mensagemErroComSecao('Importação NF-e', itensError.message) }
  }

  const fornecedorRel = (imp as { fornecedores: { nome: string } | { nome: string }[] | null })
    .fornecedores
  const fornecedorNome = Array.isArray(fornecedorRel)
    ? (fornecedorRel[0]?.nome ?? '')
    : (fornecedorRel?.nome ?? '')

  const linhas: ItemConferenciaNfe[] = (itens ?? []).map((row) => {
    const produtoRel = (row as { produtos: { nome: string; codigo_barras: string | null } | { nome: string; codigo_barras: string | null }[] | null }).produtos
    const produto = Array.isArray(produtoRel) ? produtoRel[0] : produtoRel
    return {
      item_id: row.id as string,
      produto_id: row.produto_id as string,
      produto_nome: produto?.nome ?? '',
      produto_codigo_barras: produto?.codigo_barras ?? null,
      quantidade_nfe: Number(row.quantidade_nfe),
      custo_unitario: Number(row.custo_unitario),
      atualizar_custo: Boolean(row.atualizar_custo),
      quantidade_conferida:
        row.quantidade_conferida != null ? Number(row.quantidade_conferida) : null,
      divergencia_obs: (row.divergencia_obs as string | null) ?? null,
      status_conferencia: row.status_conferencia as ItemConferenciaNfe['status_conferencia'],
    }
  })

  let ordemCompra: OrdemCompraVinculadaNfe | null = null
  const ocId = (imp as { ordem_compra_id?: string | null }).ordem_compra_id ?? null
  if (ocId) {
    const oc = await carregarSaldoOcItens(supabase, lojaId, ocId)
    if (oc) {
      const produtosDoPedido = new Set(oc.itens.map((i) => i.produto_id).filter((p): p is string => !!p))
      ordemCompra = {
        oc_id: ocId,
        fornecedor_nome: oc.fornecedor_nome,
        status: oc.resumo.status,
        pedido_total: oc.resumo.pedido_total,
        recebido_total: oc.resumo.recebido_total,
        pendente_total: oc.resumo.pendente_total,
        itens_fora_do_pedido: linhas.filter((l) => !produtosDoPedido.has(l.produto_id)).map((l) => l.produto_nome),
      }
    }
  }

  return {
    success: true,
    data: {
      importacao_id: imp.id as string,
      status: imp.status as 'EM_CONFERENCIA' | 'CONCLUIDA',
      numero_nf: (imp.numero_nf as string | null) ?? null,
      fornecedor_nome: fornecedorNome,
      created_at: imp.created_at as string,
      itens: linhas,
      ordem_compra: ordemCompra,
    },
  }
}

/**
 * UX-04 — o operador relaciona (ou, com `ordem_compra_id` nulo, desfaz) a NF-e a um pedido.
 * O sistema nunca presume o vínculo. O abatimento do saldo só acontece em `confirmarImportacaoNfe`,
 * item a item, dentro da mesma transação que credita estoque/custo/contas a pagar (que seguem
 * exatamente como antes). Não toca em nada fiscal.
 */
export async function vincularImportacaoNfeOrdemCompra(input: {
  importacao_id: string
  ordem_compra_id: string | null
}): Promise<ActionResult<null>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const lojaId = await lojaIdDoUsuarioLogado()
  if (!lojaId) return { success: false, error: 'Não foi possível identificar sua loja.' }

  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuid.test(input.importacao_id) || (input.ordem_compra_id !== null && !uuid.test(input.ordem_compra_id))) {
    return { success: false, error: 'Identificador inválido.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('vincular_importacao_nfe_ordem_compra', {
    p_importacao_id: input.importacao_id,
    ...(input.ordem_compra_id ? { p_oc_id: input.ordem_compra_id } : {}),
  })
  if (error) return { success: false, error: mapRpcImportNfe(error.message) }

  revalidatePath('/admin/estoque/importar-nfe')
  return { success: true, data: null }
}

export type ResumoContasPagarImportacaoNfe = {
  quantidade: number
  valor_total: number
  /** `YYYY-MM-DD` do menor vencimento entre as contas geradas; `null` se não houver. */
  primeiro_vencimento: string | null
  fornecedor_id: string | null
}

/**
 * Contas a pagar já registradas para uma importação de NF-e (uma por duplicata
 * do XML, criadas por `confirmar_importacao_nfe`). Somente leitura: existe para
 * a tela dizer ao operador o que a confirmação gerou no financeiro — a
 * consequência já existia, só não aparecia. Contas canceladas não entram.
 */
export async function obterResumoContasPagarImportacaoNfe(
  importacaoId: string,
): Promise<ActionResult<ResumoContasPagarImportacaoNfe>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const lojaId = await lojaIdDoUsuarioLogado()
  if (!lojaId) return { success: false, error: 'Não foi possível identificar sua loja.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('contas_pagar')
    .select('valor_total, vencimento, fornecedor_id')
    .eq('nfe_importacao_id', importacaoId)
    .eq('loja_id', lojaId)
    .neq('status', 'CANCELADO')

  if (error) {
    return { success: false, error: mensagemErroComSecao('Contas a pagar', error.message) }
  }

  const linhas = data ?? []
  const vencimentos = linhas
    .map((l) => (l.vencimento as string | null) ?? null)
    .filter((v): v is string => !!v)
    .sort()

  return {
    success: true,
    data: {
      quantidade: linhas.length,
      valor_total: linhas.reduce((acc, l) => acc + Number(l.valor_total ?? 0), 0),
      primeiro_vencimento: vencimentos[0] ?? null,
      fornecedor_id: (linhas[0]?.fornecedor_id as string | null | undefined) ?? null,
    },
  }
}

export type ImportacaoNfePendente = {
  importacao_id: string
  numero_nf: string | null
  fornecedor_nome: string
  created_at: string
  itens_total: number
  itens_conferidos: number
}

/** Importações já processadas (catálogo atualizado) que ainda aguardam conferência de quantidade. */
export async function listarImportacoesNfePendentes(): Promise<
  ActionResult<ImportacaoNfePendente[]>
> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const lojaId = await lojaIdDoUsuarioLogado()
  if (!lojaId) return { success: false, error: 'Não foi possível identificar sua loja.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('importacoes_nfe')
    .select(
      'id, numero_nf, created_at, fornecedores(nome), importacoes_nfe_itens(status_conferencia)',
    )
    .eq('loja_id', lojaId)
    .eq('status', 'EM_CONFERENCIA')
    .order('created_at', { ascending: false })
    // Lista de pendências, não um catálogo — 100 é folgado para o volume
    // real de NF-e aguardando conferência numa única loja. Se algum dia
    // isso não bastar, o próximo passo é paginação de verdade, não subir
    // este número de novo.
    .limit(100)

  if (error) {
    return { success: false, error: mensagemErroComSecao('Importação NF-e', error.message) }
  }

  const rows: ImportacaoNfePendente[] = (data ?? [])
    .map((r) => {
      const fornecedorRel = (r as { fornecedores: { nome: string } | { nome: string }[] | null })
        .fornecedores
      const fornecedorNome = Array.isArray(fornecedorRel)
        ? (fornecedorRel[0]?.nome ?? '')
        : (fornecedorRel?.nome ?? '')
      const itensRel = (r as { importacoes_nfe_itens: { status_conferencia: string }[] | null })
        .importacoes_nfe_itens
      const itens = itensRel ?? []
      return {
        importacao_id: r.id as string,
        numero_nf: (r.numero_nf as string | null) ?? null,
        fornecedor_nome: fornecedorNome,
        created_at: r.created_at as string,
        itens_total: itens.length,
        itens_conferidos: itens.filter((i) => i.status_conferencia !== 'EM_CONFERENCIA').length,
      }
    })
    // Defesa contra registro legado: a coluna `status` da 296 aplicou
    // EM_CONFERENCIA por default a QUALQUER linha pré-existente de
    // importacoes_nfe, mesmo uma sem nenhum item (a tabela
    // importacoes_nfe_itens só passou a existir a partir dessa mesma
    // migration). Sem este filtro, uma importação assim abriria uma
    // conferência vazia que a UI nunca consegue confirmar. Não há hoje
    // nenhuma linha nessa condição em produção (importacoes_nfe: 0 linhas,
    // confirmado antes deste PR) — mantido mesmo assim por segurança para
    // outras instalações.
    .filter((row) => row.itens_total > 0)

  return { success: true, data: rows }
}

/** Registra a contagem física por item (pré-requisito de `confirmarImportacaoNfe`). */
export async function registrarConferenciaNfe(
  input: unknown,
): Promise<ActionResult<{ itens_conferidos: number; itens_divergentes: number }>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsedPayload = RegistrarConferenciaNfePayloadSchema.safeParse(input)
  if (!parsedPayload.success) {
    const msg = parsedPayload.error.issues.map((i) => i.message).join('; ')
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod(msg, idioma) }
  }

  const lojaId = await lojaIdDoUsuarioLogado()
  if (!lojaId) return { success: false, error: 'Não foi possível identificar sua loja.' }

  const supabase = await createClient()
  const writer = createInventoryMovementWriter(supabase, lojaId)
  const p = parsedPayload.data

  const result = await writer.registrarConferenciaNfe({
    importacaoId: p.importacao_id,
    itens: p.itens.map((item) => ({
      itemId: item.item_id,
      quantidadeConferida: item.quantidade_conferida,
      divergenciaObs: item.divergencia_obs,
    })),
  })

  if (!result.ok) {
    return { success: false, error: mapRpcImportNfe(result.error) }
  }

  revalidatePath('/admin/estoque/importar-nfe')
  return {
    success: true,
    data: {
      itens_conferidos: result.itensConferidos,
      itens_divergentes: result.itensDivergentes,
    },
  }
}

/**
 * Único ponto que credita estoque, atualiza custo e gera contas a pagar da NF-e.
 * Recusa (`IMPORT_NFE_CONFERENCIA_PENDENTE`) se algum item ainda não foi conferido.
 */
export type ConfirmarImportacaoNfeResultado = {
  /** Estado do pedido relacionado à NF-e depois da confirmação; `null` se não houve pedido. */
  oc: OcResumoRecebimento | null
  /** Quanto a NF-e abateu do pedido (itens da nota que fazem parte do pedido). */
  abatido: number
}

export async function confirmarImportacaoNfe(
  input: unknown,
): Promise<ActionResult<ConfirmarImportacaoNfeResultado>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsedPayload = ConfirmarImportacaoNfePayloadSchema.safeParse(input)
  if (!parsedPayload.success) {
    const msg = parsedPayload.error.issues.map((i) => i.message).join('; ')
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod(msg, idioma) }
  }

  const lojaId = await lojaIdDoUsuarioLogado()
  if (!lojaId) return { success: false, error: 'Não foi possível identificar sua loja.' }

  const supabase = await createClient()
  const writer = createInventoryMovementWriter(supabase, lojaId)

  // Antes de confirmar: qual pedido (se algum) o operador relacionou a esta NF-e.
  const { data: impAntes } = await supabase
    .from('importacoes_nfe')
    .select('ordem_compra_id')
    .eq('id', parsedPayload.data.importacao_id)
    .eq('loja_id', lojaId)
    .maybeSingle()
  const ocId = (impAntes as { ordem_compra_id?: string | null } | null)?.ordem_compra_id ?? null

  const result = await writer.confirmarImportacaoNfe({
    importacaoId: parsedPayload.data.importacao_id,
  })

  if (!result.ok) {
    return { success: false, error: mapRpcImportNfe(result.error) }
  }

  let oc: OcResumoRecebimento | null = null
  let abatido = 0
  if (ocId) {
    oc = await carregarResumoOc(supabase, lojaId, ocId)
    abatido = await somaAtribuidaImportacao(supabase, lojaId, parsedPayload.data.importacao_id)
    revalidatePath('/admin/compras')
    revalidatePath('/gerente/compras')
  }

  revalidatePath('/admin/estoque')
  revalidatePath('/admin/estoque/importar-nfe')
  revalidatePath('/admin/catalogo')
  revalidatePath('/admin/auditoria')
  revalidatePath('/gerente/estoque')
  revalidatePath('/gerente/produtos')
  return { success: true, data: { oc, abatido } }
}
