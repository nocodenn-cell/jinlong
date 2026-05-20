'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteOuDono } from '@/lib/auth/gerenteOuDono'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import {
  mensagemErroComSecao,
  mensagemErroValidacaoZod,
} from '@/lib/errors/mensagemErroUsuario'
import { parseNfeXml, type NfeParsed } from '@/lib/nfe/nfeParser'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { ImportNfePayloadSchema } from './actions.validation'

type ActionResult<T = null> =
  | { success: true; data: T }
  | { success: false; error: string }

async function lojaIdDoUsuarioLogado(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('usuarios')
    .select('loja_id')
    .eq('id', user.id)
    .maybeSingle()
  return (data?.loja_id as string | undefined) ?? LOJA_MATRIZ_ID
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

export type LinhaPreviewNfe = {
  nome_produto: string
  gtin: string | null
  ref_fornecedor: string
  ncm: string | null
  u_com: string | null
  q_com: number
  v_un_com: number
  status_produto: 'NOVO' | 'EXISTENTE'
  produto_id: string | null
}

export async function previewImportacaoNfe(xml: string): Promise<
  ActionResult<{ parsed: NfeParsed; linhas: LinhaPreviewNfe[] }>
> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

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

  const byGtin = new Map<string, string>()
  if (gtins.length > 0) {
    const { data: rows } = await supabase.from('produtos').select('id, codigo_barras').in('codigo_barras', gtins)
    for (const r of rows ?? []) {
      const cb = r.codigo_barras as string | null
      if (cb) byGtin.set(cb, r.id as string)
    }
  }

  const byRef = new Map<string, string>()
  if (fornId && refs.length > 0) {
    const { data: rows } = await supabase
      .from('produtos')
      .select('id, referencia_fornecedor')
      .eq('fornecedor_id', fornId)
      .in('referencia_fornecedor', refs)
    for (const r of rows ?? []) {
      const ref = r.referencia_fornecedor as string | null
      if (ref) byRef.set(ref, r.id as string)
    }
  }

  const linhas: LinhaPreviewNfe[] = parsed.itens.map((item) => {
    let produtoId: string | null = null
    if (item.gtin && item.gtin.length >= 8) {
      produtoId = byGtin.get(item.gtin) ?? null
    }
    if (!produtoId && fornId) {
      produtoId = byRef.get(item.ref_fornecedor) ?? null
    }
    return {
      nome_produto: item.nome_produto,
      gtin: item.gtin,
      ref_fornecedor: item.ref_fornecedor,
      ncm: item.ncm,
      u_com: item.u_com,
      q_com: item.q_com,
      v_un_com: item.v_un_com,
      status_produto: produtoId ? 'EXISTENTE' : 'NOVO',
      produto_id: produtoId,
    }
  })

  return { success: true, data: { parsed, linhas } }
}

export async function executarImportacaoNfe(input: unknown): Promise<ActionResult<{ itens_processados: number }>> {
  const auth = await assertGerenteOuDono()
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
  }))

  const { data, error } = await supabase.rpc('importar_nfe_transacao', {
    p_chave_acesso: p.chave_acesso,
    p_numero_nf: p.numero_nf,
    p_fornecedor_cnpj: p.emitente_cnpj,
    p_fornecedor_nome: p.emitente_nome,
    p_loja_id: lojaId,
    p_itens: itensJson,
    p_atualizar_custo: p.atualizar_custo_padrao,
    p_duplicatas: p.duplicatas.length > 0 ? p.duplicatas : null,
  })

  if (error) {
    return { success: false, error: mapRpcImportNfe(error.message) }
  }

  const row = data as { ok?: boolean; itens_processados?: number } | null
  const n = row?.itens_processados ?? 0

  revalidatePath('/gerente/estoque')
  revalidatePath('/gerente/produtos')
  return { success: true, data: { itens_processados: n } }
}
