'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { z } from 'zod'
import { revalidatePath, unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { getGerenteLojaId } from '@/lib/gerente/auth/sessionContext'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { createProdutoRepository } from '@/lib/adapters/supabase/produtoRepository'
import {
  criarProdutoComEstoque,
  alternarAtivoProduto as alternarAtivoNoDominio,
  publicarProdutoCatalogo,
  inativarProdutoCatalogo,
} from '@/core/services/produtoService'
import {
  dualWriteFromStatus,
  resolveStatusPublicacaoLeitura,
  statusFromAtivoLegacy,
} from '@/core/catalog/statusPublicacao'
import { statusInicialProduto } from '@/core/systemRules'
import type { NovoProdutoInput, StatusPublicacao } from '@/core/ports/produto'
import { PRODUTO_IMPORT_MAX_FILE_BYTES } from '@/lib/gerente/produtosCsvContract'
import { validateProdutoImportCsvDocument } from '@/lib/gerente/parseProdutoImportCsv'
import {
  importCsvFatalToString,
  importCsvRowFailToString,
} from '@/lib/gerente/produtosImportRowMessages'
import { interpolateTemplate } from '@/lib/gerente/formatDashboardAtividade'
import { getMessages } from '@/i18n/getMessages'
import {
  mensagemErroComSecao,
  mensagemErroValidacaoZod,
} from '@/lib/errors/mensagemErroUsuario'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import {
  PRODUTO_IMAGEM_BUCKET,
  PRODUTO_IMAGEM_MAX_BYTES,
  PRODUTO_IMAGEM_MIMES,
  extensaoPorMime,
  storagePathFromProdutoImagemPublicUrl,
} from '@/lib/gerente/produtoImagemStorage'
import { motivoBloqueioExclusaoFisica } from '@/lib/gerente/produtoExclusaoLote'
import type { ProdutoGerenteRow } from './produtoGerenteTypes'

const NovoProdutoSchema = z.object({
  nome: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres.'),
  codigo_barras: z
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
    ),
  preco_varejo: z.coerce.number().positive('O preço de varejo deve ser maior que zero.'),
  preco_atacado: z.coerce.number().positive('O preço de atacado deve ser maior que zero (ou deixe em branco).').nullable().optional().transform((v) => v ?? null),
  preco_custo: z.coerce.number().nonnegative('O preço de custo não pode ser negativo.').nullable().optional().transform((v) => v ?? null),
  permitir_abaixo_custo: z.coerce.boolean().optional().transform((v) => v ?? false),
  quantidade_gatilho_atacado: z.coerce.number().int().min(1).nullable().optional().transform((v) => v ?? null),
  origem: z.enum(['china_manual', 'brasil_nf', 'brasil_sem_nf'], {
    errorMap: () => ({ message: 'Origem do produto inválida.' }),
  }),
  tem_nf: z.coerce.boolean(),
  unidade_medida: z.enum(['UN', 'KG', 'CX', 'FD', 'M']).optional().default('UN'),
  observacao: z.string().nullable().optional().transform((v) => v?.trim() || null),
  categoria_id: z.string().uuid().nullable().optional().transform((v) => v || null),
  marca_id: z.string().uuid().nullable().optional().transform((v) => v || null),
  fornecedor_id: z.string().uuid().nullable().optional().transform((v) => v || null),
  /** CSV legado pode enviar `true` → PUBLICADO; omitido → DRAFT (R1). */
  ativo: z.boolean().optional(),
  status_publicacao: z.enum(['DRAFT', 'PUBLICADO', 'INATIVO']).optional(),
  ncm: z
    .string()
    .optional()
    .transform((s) => s?.trim().replace(/\D/g, '') || null)
    .refine((s) => s === null || /^\d{8}$/.test(s), 'NCM deve ter exatamente 8 dígitos.')
    .nullable(),
  codigo_interno: z.string().nullable().optional().transform((v) => v?.trim() || null),
  estoque_minimo: z.coerce.number().nonnegative('Estoque mínimo não pode ser negativo.').nullable().optional().transform((v) => v ?? 0),
})

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

function revalidateCatalogoPaths() {
  revalidatePath('/gerente/produtos')
  revalidatePath('/gerente/estoque')
  revalidatePath('/admin/catalogo')
}

export async function criarProduto(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = NovoProdutoSchema.safeParse(input)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Erro de validação.'
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod(msg, idioma) }
  }

  // Cadastro manual nasce PUBLICADO por padrão; se ativo=false explícito, nasce INATIVO.
  const ativoExplicito = parsed.data.ativo
  const { status_publicacao: statusPadrao } = statusInicialProduto('human')
  const status_publicacao =
    ativoExplicito === false ? 'INATIVO' : statusPadrao
  const supabase = await createClient()
  const repo = createProdutoRepository(supabase)
  const result = await criarProdutoComEstoque(
    {
      ...parsed.data,
      status_publicacao,
      codigo_interno: parsed.data.codigo_interno ?? null,
      estoque_minimo: parsed.data.estoque_minimo ?? 0,
    },
    repo,
  )

  if (result.success) {
    revalidateCatalogoPaths()
  }
  return result
}

const AtualizarPrecoSchema = z.object({
  produto_id: z.string().uuid('ID do produto inválido.'),
  preco_varejo: z.coerce.number().positive('O preço de varejo deve ser maior que zero.'),
})

export async function atualizarPrecoVarejoProduto(
  input: unknown,
): Promise<ActionResult<null>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = AtualizarPrecoSchema.safeParse(input)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Erro de validação.'
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod(msg, idioma) }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('produtos')
    .update({ preco_varejo: parsed.data.preco_varejo })
    .eq('id', parsed.data.produto_id)

  if (error) {
    return {
      success: false,
      error: mensagemErroComSecao('Preço varejo', error.message),
    }
  }

  revalidatePath('/gerente/produtos')
  return { success: true, data: null }
}

export type ImportarProdutosCsvLinhaFalha = Readonly<{
  linha: number
  motivo: string
}>

export type ImportarProdutosCsvResult =
  | {
      success: true
      criados: number
      atualizados: number
      falhas: ImportarProdutosCsvLinhaFalha[]
    }
  | { success: false; error: string }

export async function importarProdutosCsv(
  formData: FormData,
): Promise<ImportarProdutosCsvResult> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma).produtos

  const raw = formData.get('file')
  if (!(raw instanceof File)) {
    return { success: false, error: m.import_modal_sem_arquivo }
  }
  if (raw.size === 0) {
    return { success: false, error: m.import_fatal_empty_file }
  }
  if (raw.size > PRODUTO_IMPORT_MAX_FILE_BYTES) {
    return { success: false, error: m.import_modal_erro_tamanho }
  }
  const nameLower = raw.name.toLowerCase()
  if (!nameLower.endsWith('.csv')) {
    return { success: false, error: m.import_modal_erro_tipo }
  }

  let text: string
  try {
    text = await raw.text()
  } catch {
    return { success: false, error: m.import_fatal_empty_file }
  }

  const atualizarPorId =
    formData.get('atualizar_por_id') === '1' ||
    formData.get('atualizar_por_id') === 'true' ||
    formData.get('atualizar_por_id') === 'on'

  const validated = validateProdutoImportCsvDocument(text, {
    permiteAtualizacaoPorId: atualizarPorId,
  })
  if (!validated.ok) {
    return { success: false, error: importCsvFatalToString(validated.fatal, m) }
  }

  const supabase = await createClient()
  const repo = createProdutoRepository(supabase)

  let criados = 0
  let atualizados = 0
  const falhas: ImportarProdutosCsvLinhaFalha[] = []

  for (const o of validated.outcomes) {
    if (!o.ok) {
      falhas.push({
        linha: o.lineNo,
        motivo: importCsvRowFailToString(o.reason, m),
      })
      continue
    }
    const row = o.data
    const idPreenchido = typeof row.id === 'string' && row.id.length > 0

    if (atualizarPorId && idPreenchido) {
      const { data: existente, error: exErr } = await supabase
        .from('produtos')
        .select('id')
        .eq('id', row.id)
        .maybeSingle()
      if (exErr) {
        falhas.push({
          linha: o.lineNo,
          motivo: mensagemErroComSecao(m.import_row_atualizar_secao, exErr.message, idioma),
        })
        continue
      }
      if (!existente) {
        falhas.push({
          linha: o.lineNo,
          motivo: interpolateTemplate(m.import_row_id_nao_encontrado, { id: row.id }),
        })
        continue
      }
      const csvLifecycle = row.ativo
        ? dualWriteFromStatus('PUBLICADO')
        : dualWriteFromStatus('INATIVO')
      const { error: upErr } = await supabase
        .from('produtos')
        .update({
          nome: row.nome,
          codigo_barras: row.codigo_barras,
          preco_varejo: row.preco_varejo,
          preco_atacado: row.preco_atacado ?? null,
          quantidade_gatilho_atacado: row.quantidade_gatilho_atacado ?? null,
          unidade_medida: row.unidade_medida ?? 'UN',
          observacao: row.observacao ?? null,
          origem: row.origem,
          tem_nf: row.tem_nf,
          ativo: csvLifecycle.ativo,
          status_publicacao: csvLifecycle.status_publicacao,
        })
        .eq('id', row.id)

      if (upErr) {
        falhas.push({
          linha: o.lineNo,
          motivo: mensagemErroComSecao(m.import_row_atualizar_secao, upErr.message, idioma),
        })
      } else {
        atualizados++
      }
      continue
    }

    const input: NovoProdutoInput = {
      nome: row.nome,
      codigo_barras: row.codigo_barras,
      preco_varejo: row.preco_varejo,
      preco_atacado: row.preco_atacado ?? null,
      quantidade_gatilho_atacado: row.quantidade_gatilho_atacado ?? null,
      unidade_medida: row.unidade_medida ?? 'UN',
      observacao: row.observacao ?? null,
      origem: row.origem,
      tem_nf: row.tem_nf,
      ativo: row.ativo,
    }
    const result = await criarProdutoComEstoque(input, repo)
    if (!result.success) {
      falhas.push({ linha: o.lineNo, motivo: result.error })
    } else {
      criados++
    }
  }

  if (criados > 0 || atualizados > 0) {
    revalidateCatalogoPaths()
  }

  return { success: true, criados, atualizados, falhas }
}

export async function uploadImagemProduto(
  formData: FormData,
): Promise<ActionResult<{ imagem_url: string }>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const { idioma } = await getUsuarioIdioma()
  const p = getMessages(idioma).produtos

  const produtoIdRaw = formData.get('produto_id')
  const produtoIdParsed = z.string().uuid().safeParse(
    typeof produtoIdRaw === 'string' ? produtoIdRaw : '',
  )
  if (!produtoIdParsed.success) {
    return { success: false, error: mensagemErroValidacaoZod('ID inválido.', idioma) }
  }
  const produtoId = produtoIdParsed.data

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return { success: false, error: p.foto_erro_sem_arquivo }
  }
  if (file.size === 0) {
    return { success: false, error: p.foto_erro_sem_arquivo }
  }
  if (file.size > PRODUTO_IMAGEM_MAX_BYTES) {
    return { success: false, error: p.foto_erro_tamanho }
  }
  const mime = file.type
  if (!PRODUTO_IMAGEM_MIMES.includes(mime as (typeof PRODUTO_IMAGEM_MIMES)[number])) {
    return { success: false, error: p.foto_erro_tipo }
  }
  const ext = extensaoPorMime(mime)
  if (!ext) {
    return { success: false, error: p.foto_erro_tipo }
  }

  const supabase = await createClient()
  const objectPath = `${produtoId}/${crypto.randomUUID()}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { data: oldRow } = await supabase
    .from('produtos')
    .select('imagem_url')
    .eq('id', produtoId)
    .maybeSingle()

  const { error: uploadError } = await supabase.storage
    .from(PRODUTO_IMAGEM_BUCKET)
    .upload(objectPath, bytes, {
      contentType: mime,
      cacheControl: '3600',
      upsert: false,
    })

  if (uploadError) {
    return {
      success: false,
      error: mensagemErroComSecao(p.foto_secao_upload, uploadError.message, idioma),
    }
  }

  const { data: pub } = supabase.storage.from(PRODUTO_IMAGEM_BUCKET).getPublicUrl(objectPath)
  const publicUrl = pub.publicUrl

  const { error: dbError } = await supabase
    .from('produtos')
    .update({ imagem_url: publicUrl })
    .eq('id', produtoId)

  if (dbError) {
    await supabase.storage.from(PRODUTO_IMAGEM_BUCKET).remove([objectPath])
    return {
      success: false,
      error: mensagemErroComSecao(p.foto_secao_guardar, dbError.message, idioma),
    }
  }

  const oldUrl = (oldRow as { imagem_url?: string | null } | null)?.imagem_url
  const oldPath = oldUrl ? storagePathFromProdutoImagemPublicUrl(oldUrl) : null
  if (oldPath && oldPath !== objectPath) {
    await supabase.storage.from(PRODUTO_IMAGEM_BUCKET).remove([oldPath])
  }

  revalidatePath('/gerente/produtos')
  return { success: true, data: { imagem_url: publicUrl } }
}

export async function removerImagemProduto(produtoId: string): Promise<ActionResult<null>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const { idioma } = await getUsuarioIdioma()
  const p = getMessages(idioma).produtos

  const idParsed = z.string().uuid().safeParse(produtoId)
  if (!idParsed.success) {
    return { success: false, error: mensagemErroValidacaoZod('ID inválido.', idioma) }
  }

  const supabase = await createClient()
  const { data: row } = await supabase
    .from('produtos')
    .select('imagem_url')
    .eq('id', idParsed.data)
    .maybeSingle()

  const url = (row as { imagem_url?: string | null } | null)?.imagem_url
  const path = url ? storagePathFromProdutoImagemPublicUrl(url) : null

  const { error: dbError } = await supabase
    .from('produtos')
    .update({ imagem_url: null })
    .eq('id', idParsed.data)

  if (dbError) {
    return {
      success: false,
      error: mensagemErroComSecao(p.foto_secao_guardar, dbError.message, idioma),
    }
  }

  if (path) {
    await supabase.storage.from(PRODUTO_IMAGEM_BUCKET).remove([path])
  }

  revalidatePath('/gerente/produtos')
  return { success: true, data: null }
}

export async function alternarAtivoProduto(
  produtoId: string,
  ativo: boolean,
): Promise<ActionResult<null>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  const repo = createProdutoRepository(supabase)
  const result = await alternarAtivoNoDominio(produtoId, ativo, repo)

  if (!result.success) {
    return { success: false, error: result.error }
  }
  revalidateCatalogoPaths()
  return { success: true, data: null }
}

const ProdutoIdSchema = z.string().uuid('ID do produto inválido.')

export async function publicarProduto(produtoId: string): Promise<ActionResult<null>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = ProdutoIdSchema.safeParse(produtoId)
  if (!parsed.success) {
    const { idioma } = await getUsuarioIdioma()
    return {
      success: false,
      error: mensagemErroValidacaoZod(parsed.error.issues[0]?.message ?? 'ID inválido.', idioma),
    }
  }

  const supabase = await createClient()
  const repo = createProdutoRepository(supabase)
  const result = await publicarProdutoCatalogo(parsed.data, repo)
  if (!result.success) return { success: false, error: result.error }

  revalidateCatalogoPaths()
  return { success: true, data: null }
}

export async function inativarProduto(produtoId: string): Promise<ActionResult<null>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = ProdutoIdSchema.safeParse(produtoId)
  if (!parsed.success) {
    const { idioma } = await getUsuarioIdioma()
    return {
      success: false,
      error: mensagemErroValidacaoZod(parsed.error.issues[0]?.message ?? 'ID inválido.', idioma),
    }
  }

  const supabase = await createClient()
  const repo = createProdutoRepository(supabase)
  const result = await inativarProdutoCatalogo(parsed.data, repo)
  if (!result.success) return { success: false, error: result.error }

  revalidateCatalogoPaths()
  return { success: true, data: null }
}

const LotePublicacaoSchema = z.object({
  produto_ids: z.array(z.string().uuid()).min(1).max(200),
})

export async function publicarProdutosLote(
  rawIds: string[],
): Promise<ActionResult<{ publicados: number }>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = LotePublicacaoSchema.safeParse({ produto_ids: rawIds })
  if (!parsed.success) {
    const { idioma } = await getUsuarioIdioma()
    return {
      success: false,
      error: mensagemErroValidacaoZod(parsed.error.issues[0]?.message ?? 'Erro', idioma),
    }
  }

  const supabase = await createClient()
  const lojaId = await lojaIdParaListagemProdutos()
  const lifecycle = dualWriteFromStatus('PUBLICADO')
  const { error, count } = await supabase
    .from('produtos')
    .update({
      status_publicacao: lifecycle.status_publicacao,
      ativo: lifecycle.ativo,
    })
    .in('id', parsed.data.produto_ids)
    .eq('loja_id', lojaId)

  if (error) {
    return { success: false, error: mensagemErroComSecao('Publicar produtos', error.message) }
  }

  revalidateCatalogoPaths()
  return { success: true, data: { publicados: count ?? parsed.data.produto_ids.length } }
}

const LoteExclusaoSchema = z.object({
  produto_ids: z.array(z.string().uuid()).min(1).max(100),
})

const EditarProdutoCatalogoSchema = z.object({
  produto_id: z.string().uuid('ID do produto inválido.'),
  nome: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres.'),
  codigo_barras: z
    .string()
    .optional()
    .transform((s) => {
      const t = (s ?? '').trim()
      return t.length === 0 ? null : t
    })
    .refine(
      (s) => s === null || s.length >= 3,
      'Código de barras: mínimo 3 caracteres ou deixe em branco',
    ),
  origem: z.enum(['china_manual', 'brasil_nf', 'brasil_sem_nf'], {
    errorMap: () => ({ message: 'Origem do produto inválida.' }),
  }),
  tem_nf: z.coerce.boolean(),
  preco_varejo: z.coerce.number().positive('O preço de varejo deve ser maior que zero.'),
  preco_atacado: z.coerce.number().positive('O preço de atacado deve ser maior que zero (ou deixe em branco).').nullable().optional().transform((v) => v ?? null),
  preco_custo: z.coerce.number().nonnegative('O preço de custo não pode ser negativo.').nullable().optional().transform((v) => v ?? null),
  permitir_abaixo_custo: z.coerce.boolean().optional().transform((v) => v ?? false),
  quantidade_gatilho_atacado: z.coerce.number().int().min(1).nullable().optional().transform((v) => v ?? null),
  categoria_id: z.string().uuid().nullable().optional().transform((v) => v || null),
  marca_id: z.string().uuid().nullable().optional().transform((v) => v || null),
  fornecedor_id: z.string().uuid().nullable().optional().transform((v) => v || null),
  unidade_medida: z.enum(['UN', 'KG', 'CX', 'FD', 'M']).default('UN'),
  observacao: z.string().nullable().optional().transform((v) => v?.trim() || null),
  // ── Campos fiscais (Focus NFe) ──────────────────────────────────────────
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
  codigo_interno: z.string().nullable().optional().transform((v) => v?.trim() || null),
  estoque_minimo: z.coerce.number().nonnegative('Estoque mínimo não pode ser negativo.').nullable().optional().transform((v) => v ?? 0),
  ativo: z.boolean().optional(),
})

export type ResultadoExclusaoLote = Readonly<{
  removidos: number
  inativados: number
  ja_inativos: number
  falhas: ReadonlyArray<{ produto_id: string; motivo: string }>
}>

async function excluirProdutoFisicamenteSeLimpo(
  supabase: SupabaseClient,
  produtoId: string,
  idioma: string,
  p: ReturnType<typeof getMessages>['produtos'],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error: eRegras } = await supabase.from('regras_preco').delete().eq('produto_id', produtoId)
  if (eRegras) {
    return {
      ok: false,
      message: mensagemErroComSecao(p.exclusao_secao_regras_preco, eRegras.message, idioma),
    }
  }

  const { error: eEst } = await supabase.from('estoque').delete().eq('produto_id', produtoId)
  if (eEst) {
    return {
      ok: false,
      message: mensagemErroComSecao(p.exclusao_secao_estoque, eEst.message, idioma),
    }
  }

  const { data: row } = await supabase.from('produtos').select('imagem_url').eq('id', produtoId).maybeSingle()
  const url = (row as { imagem_url?: string | null } | null)?.imagem_url
  const path = url ? storagePathFromProdutoImagemPublicUrl(url) : null
  if (path) {
    await supabase.storage.from(PRODUTO_IMAGEM_BUCKET).remove([path])
  }

  const { error: eDel } = await supabase.from('produtos').delete().eq('id', produtoId)
  if (eDel) {
    return {
      ok: false,
      message: mensagemErroComSecao(p.exclusao_secao_produto, eDel.message, idioma),
    }
  }
  return { ok: true }
}

export async function aplicarExclusaoOuInativacaoEmLote(
  rawIds: unknown,
): Promise<{ success: true; data: ResultadoExclusaoLote } | { success: false; error: string }> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma).produtos

  const parsed = LoteExclusaoSchema.safeParse(rawIds)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Erro de validação.'
    return { success: false, error: mensagemErroValidacaoZod(msg, idioma) }
  }

  const ids = [...new Set(parsed.data.produto_ids)]
  const supabase = await createClient()
  const repo = createProdutoRepository(supabase)

  const falhas: { produto_id: string; motivo: string }[] = []
  let removidos = 0
  let inativados = 0
  let ja_inativos = 0

  for (const id of ids) {
    const { data: prod, error: gErr } = await supabase
      .from('produtos')
      .select('id, ativo')
      .eq('id', id)
      .maybeSingle()

    if (gErr) {
      falhas.push({
        produto_id: id,
        motivo: mensagemErroComSecao(m.exclusao_secao_leitura, gErr.message, idioma),
      })
      continue
    }
    if (!prod) {
      falhas.push({ produto_id: id, motivo: m.exclusao_produto_nao_encontrado })
      continue
    }

    const ativo = Boolean((prod as { ativo?: boolean }).ativo)

    let bloqueio: Awaited<ReturnType<typeof motivoBloqueioExclusaoFisica>> | null
    try {
      bloqueio = await motivoBloqueioExclusaoFisica(supabase, id)
    } catch (e) {
      falhas.push({
        produto_id: id,
        motivo: e instanceof Error ? e.message : String(e),
      })
      continue
    }

    if (bloqueio) {
      if (ativo) {
        const r = await alternarAtivoNoDominio(id, false, repo)
        if (!r.success) {
          falhas.push({ produto_id: id, motivo: r.error })
        } else {
          inativados++
        }
      } else {
        ja_inativos++
      }
      continue
    }

    const del = await excluirProdutoFisicamenteSeLimpo(supabase, id, idioma, m)
    if (del.ok) {
      removidos++
      continue
    }

    if (ativo) {
      const r = await alternarAtivoNoDominio(id, false, repo)
      if (!r.success) {
        falhas.push({ produto_id: id, motivo: `${del.message} · ${r.error}` })
      } else {
        inativados++
      }
    } else {
      ja_inativos++
    }
  }

  if (removidos > 0 || inativados > 0) {
    revalidatePath('/gerente/produtos')
  }

  return {
    success: true,
    data: { removidos, inativados, ja_inativos, falhas },
  }
}

export async function atualizarDadosProdutoGerente(
  input: unknown,
): Promise<ActionResult<null>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = EditarProdutoCatalogoSchema.safeParse(input)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Erro de validação.'
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod(msg, idioma) }
  }

  const supabase = await createClient()

  const produtoUpdate: Record<string, unknown> = {
    nome: parsed.data.nome,
    codigo_barras: parsed.data.codigo_barras,
    codigo_interno: parsed.data.codigo_interno,
    origem: parsed.data.origem,
    tem_nf: parsed.data.tem_nf,
    preco_varejo: parsed.data.preco_varejo,
    preco_atacado: parsed.data.preco_atacado,
    preco_custo: parsed.data.preco_custo,
    permitir_abaixo_custo: parsed.data.permitir_abaixo_custo,
    quantidade_gatilho_atacado: parsed.data.quantidade_gatilho_atacado,
    categoria_id: parsed.data.categoria_id,
    marca_id: parsed.data.marca_id,
    fornecedor_id: parsed.data.fornecedor_id,
    unidade_medida: parsed.data.unidade_medida,
    observacao: parsed.data.observacao,
    ncm: parsed.data.ncm,
    cfop_produto: parsed.data.cfop_produto,
    csosn: parsed.data.csosn,
    cest: parsed.data.cest,
    cst_pis: parsed.data.cst_pis,
    cst_cofins: parsed.data.cst_cofins,
  }

  if (parsed.data.ativo !== undefined) {
    const lifecycle = dualWriteFromStatus(statusFromAtivoLegacy(parsed.data.ativo))
    produtoUpdate.ativo = lifecycle.ativo
    produtoUpdate.status_publicacao = lifecycle.status_publicacao
  }

  const { error } = await supabase
    .from('produtos')
    .update(produtoUpdate)
    .eq('id', parsed.data.produto_id)

  if (error) {
    const { idioma } = await getUsuarioIdioma()
    return {
      success: false,
      error: mensagemErroComSecao('Produto', error.message, idioma),
    }
  }

  if (parsed.data.estoque_minimo !== undefined && parsed.data.estoque_minimo !== null) {
    await supabase
      .from('estoque')
      .update({ estoque_minimo: parsed.data.estoque_minimo })
      .eq('produto_id', parsed.data.produto_id)
  }

  revalidateCatalogoPaths()
  return { success: true, data: null }
}

const BuscarProdutosComFiltrosInputSchema = z.object({
  situacao: z.enum(['todos', 'ativos', 'inativos']).default('todos'),
  origem: z.enum(['all', 'china_manual', 'brasil_nf', 'brasil_sem_nf']).default('all'),
  nf: z.enum(['all', 'sim', 'nao']).default('all'),
  estoque: z.enum(['todos', 'abaixo_minimo', 'em_falta']).default('todos'),
  imagens: z.enum(['todos', 'com_imagem', 'sem_imagem']).default('todos'),
  tags: z.array(z.string().min(1).max(64)).max(20).default([]),
  categoriaId: z.string().uuid().optional(),
  marcaId: z.string().uuid().optional(),
  fornecedorId: z.string().uuid().optional(),
  busca: z.string().max(200).default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
})

export type BuscarProdutosComFiltrosInput = z.infer<typeof BuscarProdutosComFiltrosInputSchema>

export type OpcoesFiltrosProdutos = {
  categorias: { id: string; nome: string }[]
  marcas: { id: string; nome: string }[]
  fornecedores: { id: string; nome: string }[]
}

async function lojaIdParaListagemProdutos(): Promise<string> {
  return (await getGerenteLojaId()) ?? LOJA_MATRIZ_ID
}

/**
 * Opções para selects de filtros (categorias, marcas, fornecedores).
 */
/**
 * Busca as opções de filtro do lado servidor, cacheada com TTL de 120 s.
 * Categorias/marcas/fornecedores raramente mudam — não faz sentido buscá-los
 * a cada clique de navegação. A tag `catalogo-opcoes-filtro` é revalidada
 * sempre que uma categoria, marca ou fornecedor é criado/editado/excluído.
 *
 * `unstable_cache` exige que a função não use cookies/headers (são injetados
 * no supabase client aqui de forma segura porque os dados são públicos do catálogo).
 */
const buscarOpcoesFiltrosCached = unstable_cache(
  async (): Promise<OpcoesFiltrosProdutos> => {
    const supabase = await createClient()
    const [cat, mar, forn] = await Promise.all([
      supabase.from('categorias').select('id, nome').order('nome', { ascending: true }),
      supabase.from('marcas').select('id, nome').eq('ativo', true).order('nome', { ascending: true }),
      supabase.from('fornecedores').select('id, nome').order('nome', { ascending: true }),
    ])
    return {
      categorias: ((cat.data ?? []) as { id: string; nome: string }[]),
      marcas: ((mar.data ?? []) as { id: string; nome: string }[]),
      fornecedores: ((forn.data ?? []) as { id: string; nome: string }[]),
    }
  },
  ['catalogo-opcoes-filtro'],
  { revalidate: 120, tags: ['catalogo-opcoes-filtro'] },
)

export async function listarOpcoesFiltrosProdutos(): Promise<ActionResult<OpcoesFiltrosProdutos>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const data = await buscarOpcoesFiltrosCached()
    return { success: true, data }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao carregar opções de filtro.'
    return { success: false, error: msg }
  }
}

type RpcProdutoRow = {
  id: string
  nome: string
  codigo_barras: string | null
  preco_varejo: number
  preco_atacado: number | null
  quantidade_gatilho_atacado: number | null
  origem: string
  tem_nf: boolean
  ativo: boolean
  categoria_id: string | null
  fornecedor_id: string | null
  marca_id: string | null
  unidade_medida: string | null
  observacao: string | null
  imagem_url: string | null
  tags: string[] | null
  total_count: number
  // Campos fiscais (retornados pelo RPC quando disponíveis)
  ncm: string | null
  cfop_produto: string | null
  csosn: string | null
  cest: string | null
  cst_pis: string | null
  cst_cofins: string | null
}

/**
 * Lista produtos com filtros e paginação (server-side via RPC).
 */
export async function buscarProdutosComFiltros(
  input: unknown,
): Promise<ActionResult<{ rows: ProdutoGerenteRow[]; total: number }>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = BuscarProdutosComFiltrosInputSchema.safeParse(input)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Erro de validação.'
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod(msg, idioma) }
  }

  const p = parsed.data
  const supabase = await createClient()
  const lojaId = await lojaIdParaListagemProdutos()

  const { data, error } = await supabase.rpc('list_produtos_gerente_filtrados', {
    p_loja_id: lojaId,
    p_situacao: p.situacao,
    p_origem_filtro: p.origem,
    p_nf_filtro: p.nf,
    p_estoque_filtro: p.estoque,
    p_imagens_filtro: p.imagens,
    p_tags_filtro: p.tags.length ? p.tags : null,
    p_categoria_id: p.categoriaId ?? null,
    p_marca_id: p.marcaId ?? null,
    p_fornecedor_id: p.fornecedorId ?? null,
    p_busca: p.busca?.trim() || null,
    p_page: p.page,
    p_page_size: p.pageSize,
  })

  if (error) {
    return {
      success: false,
      error: mensagemErroComSecao('Produtos', error.message),
    }
  }

  const list = (data ?? []) as RpcProdutoRow[]
  const total = list.length > 0 ? Number(list[0].total_count) : 0

  // Queries suplementares: SKU/localização (produtos) + estoque atual
  const productIds = list.map((r) => r.id)
  const [estoqueRes, extraRes] = productIds.length > 0
    ? await Promise.all([
        supabase.from('estoque').select('produto_id, quantidade_atual').in('produto_id', productIds),
        supabase
          .from('produtos')
          .select('id, codigo_interno, localizacao_prateleira, preco_custo, permitir_abaixo_custo, status_publicacao')
          .in('id', productIds),
      ])
    : [
        { data: [] as { produto_id: string; quantidade_atual: number }[] },
        {
          data: [] as {
            id: string
            codigo_interno: string | null
            localizacao_prateleira?: string | null
            preco_custo?: number | null
            permitir_abaixo_custo?: boolean
            status_publicacao?: StatusPublicacao | null
          }[],
        },
      ]

  const estoqueMap = new Map<string, number>()
  for (const e of ((estoqueRes.data ?? []) as { produto_id: string; quantidade_atual: number }[])) {
    estoqueMap.set(e.produto_id, e.quantidade_atual)
  }

  const extraMap = new Map<
    string,
    {
      codigo_interno: string | null
      localizacao_prateleira: string | null
      preco_custo: number | null
      permitir_abaixo_custo: boolean
      status_publicacao: StatusPublicacao | null
    }
  >()
  for (const p of ((extraRes.data ?? []) as {
    id: string
    codigo_interno?: string | null
    localizacao_prateleira?: string | null
    preco_custo?: number | null
    permitir_abaixo_custo?: boolean
    status_publicacao?: StatusPublicacao | null
  }[])) {
    extraMap.set(p.id, {
      codigo_interno: p.codigo_interno ?? null,
      localizacao_prateleira: p.localizacao_prateleira ?? null,
      preco_custo: p.preco_custo != null ? Number(p.preco_custo) : null,
      permitir_abaixo_custo: p.permitir_abaixo_custo ?? false,
      status_publicacao: p.status_publicacao ?? null,
    })
  }

  const rows: ProdutoGerenteRow[] = list.map((r) => {
    const extra = extraMap.get(r.id)
    const statusPublicacao = resolveStatusPublicacaoLeitura(
      extra?.status_publicacao ?? statusFromAtivoLegacy(r.ativo),
      r.ativo,
    )
    return {
      id: r.id,
      nome: r.nome,
      codigo_barras: r.codigo_barras,
      codigo_interno: extra?.codigo_interno ?? null,
      localizacao_prateleira: extra?.localizacao_prateleira ?? null,
      preco_varejo: Number(r.preco_varejo),
      preco_atacado: r.preco_atacado != null ? Number(r.preco_atacado) : null,
      preco_custo: extra?.preco_custo ?? null,
      permitir_abaixo_custo: extra?.permitir_abaixo_custo ?? false,
      quantidade_gatilho_atacado: r.quantidade_gatilho_atacado != null ? Number(r.quantidade_gatilho_atacado) : null,
      quantidade_atual: estoqueMap.has(r.id) ? (estoqueMap.get(r.id) ?? null) : null,
      origem: r.origem,
      tem_nf: r.tem_nf,
      ativo: r.ativo,
      status_publicacao: statusPublicacao,
      imagem_url: r.imagem_url ?? null,
      categoria_id: r.categoria_id ?? null,
      marca_id: r.marca_id ?? null,
      fornecedor_id: r.fornecedor_id ?? null,
      unidade_medida: r.unidade_medida ?? 'UN',
      observacao: r.observacao ?? null,
      tags: r.tags ?? null,
      ncm: r.ncm ?? null,
      cfop_produto: r.cfop_produto ?? null,
      csosn: r.csosn ?? null,
      cest: r.cest ?? null,
      cst_pis: r.cst_pis ?? null,
      cst_cofins: r.cst_cofins ?? null,
    }
  })

  return { success: true, data: { rows, total } }
}

// ─── Bulk: ativar / inativar em lote ─────────────────────────────────────────

const LoteAtivoSchema = z.object({
  produto_ids: z.array(z.string().uuid()).min(1).max(200),
  ativo: z.boolean(),
})

export async function alterarAtivoLoteProdutos(
  rawIds: string[],
  ativo: boolean,
): Promise<ActionResult<{ atualizados: number }>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = LoteAtivoSchema.safeParse({ produto_ids: rawIds, ativo })
  if (!parsed.success) {
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod(parsed.error.issues[0]?.message ?? 'Erro', idioma) }
  }

  const supabase = await createClient()
  const lojaId = await lojaIdParaListagemProdutos()
  const lifecycle = dualWriteFromStatus(statusFromAtivoLegacy(parsed.data.ativo))
  const { error, count } = await supabase
    .from('produtos')
    .update({
      ativo: lifecycle.ativo,
      status_publicacao: lifecycle.status_publicacao,
    })
    .in('id', parsed.data.produto_ids)
    .eq('loja_id', lojaId)

  if (error) {
    return { success: false, error: mensagemErroComSecao('Bulk ativo', error.message) }
  }

  revalidateCatalogoPaths()
  return { success: true, data: { atualizados: count ?? parsed.data.produto_ids.length } }
}

// ─── Bulk: alterar categoria em lote ─────────────────────────────────────────

const LoteCategoriaSchema = z.object({
  produto_ids: z.array(z.string().uuid()).min(1).max(200),
  categoria_id: z.string().uuid().nullable(),
})

export async function alterarCategoriaLoteProdutos(
  rawIds: string[],
  categoriaId: string | null,
): Promise<ActionResult<{ atualizados: number }>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = LoteCategoriaSchema.safeParse({ produto_ids: rawIds, categoria_id: categoriaId })
  if (!parsed.success) {
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod(parsed.error.issues[0]?.message ?? 'Erro', idioma) }
  }

  const supabase = await createClient()
  const lojaId = await lojaIdParaListagemProdutos()
  const { error, count } = await supabase
    .from('produtos')
    .update({ categoria_id: parsed.data.categoria_id })
    .in('id', parsed.data.produto_ids)
    .eq('loja_id', lojaId)

  if (error) {
    return { success: false, error: mensagemErroComSecao('Bulk categoria', error.message) }
  }

  revalidatePath('/gerente/produtos')
  return { success: true, data: { atualizados: count ?? parsed.data.produto_ids.length } }
}

/**
 * Export CSV: até `limite` linhas com os mesmos filtros da listagem.
 */
export async function buscarProdutosParaExportacao(
  input: unknown,
  limite: number,
): Promise<ActionResult<ProdutoGerenteRow[]>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = BuscarProdutosComFiltrosInputSchema.safeParse(input)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join('; ')
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod(msg, idioma) }
  }
  const cap = Math.min(Math.max(limite, 1), 500)
  const r = await buscarProdutosComFiltros({ ...parsed.data, page: 1, pageSize: cap })
  if (!r.success) return { success: false, error: r.error }
  return { success: true, data: r.data.rows }
}
