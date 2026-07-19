'use server'

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
import { ImportNfePayloadSchema } from './actions.validation'
import { createInventoryMovementWriter } from '@/app/admin/estoque/inventoryMovementWriter'

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
    return { success: false, error: msg }
  }

  const supabase = await createClient()
  const cnpj = onlyDigits(parsed.emitente.cnpj)

  const { data: forn } = await supabase.from('fornecedores').select('id').eq('cnpj', cnpj).maybeSingle()
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

  return { success: true, data: { parsed, linhas } }
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
  return {
    success: true,
    data: {
      itens_processados: result.itensProcessados,
      produtos_novos: result.produtosNovos,
      produtos_vinculados: result.produtosVinculados,
    },
  }
}
