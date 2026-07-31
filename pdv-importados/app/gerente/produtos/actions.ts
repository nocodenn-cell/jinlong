'use server'

import crypto from 'crypto'
import { z } from 'zod'
import { revalidatePath, unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import {
  atualizarProdutoAction,
  buscarProdutosComFiltrosAction,
  buscarProdutoPorIdAction,
  criarProdutoAction,
  excluirProdutoAction,
  setProductStatusAction,
  setProductStatusLoteAction,
  updateCategoriaLoteAction,
} from '@/app/admin/produtos/actions'
import {
  mapFormToCreateProductInput,
  mapFormToUpdateProductInput,
  mapImportRowToCreateProductInput,
} from '@/app/admin/produtos/productFormMappers'
import { mapListRowToGerente } from '@/app/admin/produtos/productListMappers'
import {
  dualWriteFromStatus,
  isIntencaoRascunho,
  lifecycleAoEditarProduto,
  podePublicarProduto,
  statusFromAtivoLegacy,
} from '@/core/catalog/statusPublicacao'
import { statusInicialProduto } from '@/core/systemRules'
import type { StatusPublicacao } from '@/core/ports/produto'
import { PRODUTO_IMPORT_MAX_FILE_BYTES, PRODUTO_IMPORT_MAX_ROWS } from '@/lib/gerente/produtosCsvContract'
import {
  parseAndValidateImportRow,
  validateProdutoImportCsvDocument,
  type ProdutoImportRowParsed,
} from '@/lib/gerente/parseProdutoImportCsv'
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
import type { ProdutoGerenteRow } from './produtoGerenteTypes'
import {
  EditarProdutoCatalogoSchema,
  EditarProdutoRascunhoSchema,
  NovoProdutoSchema,
  NovoProdutoRascunhoSchema,
} from './produtoFormSchema'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

const IMPORT_MERGE_COLS =
  'id, nome, codigo_barras, codigo_interno, referencia_fornecedor, nome_reduzido_pdv, localizacao_prateleira, preco_varejo, preco_atacado, preco_custo, permitir_abaixo_custo, quantidade_gatilho_atacado, origem, tem_nf, unidade_medida, observacao, categoria_id, marca_id, fornecedor_id, ncm, cfop_produto, csosn, cest, cst_pis, cst_cofins'

/** CSV/lote update → ProductUpdater (merge para não apagar campos omitidos). */
async function atualizarProdutoViaImportRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: ProdutoImportRowParsed,
  idioma: string,
  m: ReturnType<typeof getMessages>['produtos'],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: prev, error: exErr } = await supabase
    .from('produtos')
    .select(IMPORT_MERGE_COLS)
    .eq('id', row.id)
    .maybeSingle()
  if (exErr) {
    return {
      ok: false,
      error: mensagemErroComSecao(m.import_row_atualizar_secao, exErr.message, idioma),
    }
  }
  if (!prev) {
    return {
      ok: false,
      error: interpolateTemplate(m.import_row_id_nao_encontrado, { id: row.id }),
    }
  }
  const p = prev as Record<string, unknown>
  const csvLifecycle = row.ativo
    ? dualWriteFromStatus('PUBLICADO')
    : dualWriteFromStatus('INATIVO')
  const result = await atualizarProdutoAction(
    row.id as string,
    mapFormToUpdateProductInput(
      {
        produto_id: row.id as string,
        nome: row.nome,
        codigo_barras: row.codigo_barras,
        codigo_interno: (p.codigo_interno as string | null) ?? null,
        referencia_fornecedor: (p.referencia_fornecedor as string | null) ?? null,
        nome_reduzido_pdv: (p.nome_reduzido_pdv as string | null) ?? null,
        localizacao_prateleira: (p.localizacao_prateleira as string | null) ?? null,
        preco_varejo: row.preco_varejo,
        preco_atacado: row.preco_atacado ?? null,
        preco_custo: p.preco_custo != null ? Number(p.preco_custo) : null,
        permitir_abaixo_custo: Boolean(p.permitir_abaixo_custo),
        quantidade_gatilho_atacado: row.quantidade_gatilho_atacado ?? null,
        origem: row.origem,
        tem_nf: row.tem_nf,
        unidade_medida: row.unidade_medida ?? 'UN',
        observacao: row.observacao ?? null,
        categoria_id: (p.categoria_id as string | null) ?? null,
        marca_id: (p.marca_id as string | null) ?? null,
        fornecedor_id: (p.fornecedor_id as string | null) ?? null,
        ncm: (p.ncm as string | null) ?? null,
        cfop_produto: (p.cfop_produto as string | null) ?? null,
        csosn: (p.csosn as string | null) ?? null,
        cest: (p.cest as string | null) ?? null,
        cst_pis: (p.cst_pis as string | null) ?? null,
        cst_cofins: (p.cst_cofins as string | null) ?? null,
      },
      csvLifecycle,
    ),
  )
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true }
}

/**
 * Facade UI — Zod na borda + create via ProductWriter (admin/produtos).
 * Contrato UI: `{ success, data: { id } | error }`.
 */
export async function criarProduto(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const raw = input as { status_publicacao?: unknown }
  const asDraft = isIntencaoRascunho(raw.status_publicacao)
  const parsed = asDraft
    ? NovoProdutoRascunhoSchema.safeParse(input)
    : NovoProdutoSchema.safeParse(input)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Erro de validação.'
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod(msg, idioma) }
  }

  const lifecycle = asDraft ? dualWriteFromStatus('DRAFT') : statusInicialProduto('human')
  const result = await criarProdutoAction(
    mapFormToCreateProductInput(parsed.data, lifecycle),
  )
  if (!result.ok) return { success: false, error: result.error }
  return { success: true, data: { id: result.product.id } }
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
      const up = await atualizarProdutoViaImportRow(supabase, row, idioma, m)
      if (!up.ok) {
        falhas.push({ linha: o.lineNo, motivo: up.error })
      } else {
        atualizados++
      }
      continue
    }

    const result = await criarProdutoAction(mapImportRowToCreateProductInput(row))
    if (!result.ok) {
      falhas.push({ linha: o.lineNo, motivo: result.error })
    } else {
      criados++
    }
  }

  return { success: true, criados, atualizados, falhas }
}

/**
 * Commit em lote da grade editável (Bulk Import).
 *
 * Diferente da importação CSV linha-a-linha, este caminho é **tudo-ou-nada**:
 *  1. Revalida cada linha no servidor (fonte única da verdade). Se **qualquer** linha
 *     for inválida, nada é gravado e todos os erros são devolvidos por linha.
 *  2. Pré-checa códigos de barras duplicados (dentro do lote e contra a base) antes de
 *     escrever — o conflito mais comum é reportado com precisão, sem gravar nada.
 *  3. Grava com **rollback seguro**: em qualquer falha inesperada no meio do lote, as
 *     criações são apagadas e as atualizações são revertidas a partir do snapshot.
 */
export async function importarProdutosLote(
  linhasRaw: ReadonlyArray<Record<string, string>>,
  atualizarPorId: boolean,
): Promise<ImportarProdutosCsvResult> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma).produtos

  if (!Array.isArray(linhasRaw) || linhasRaw.length === 0) {
    return { success: false, error: m.import_lote_vazio }
  }
  if (linhasRaw.length > PRODUTO_IMPORT_MAX_ROWS) {
    return {
      success: false,
      error: interpolateTemplate(m.import_fatal_too_many_rows, {
        count: String(linhasRaw.length),
        max: String(PRODUTO_IMPORT_MAX_ROWS),
      }),
    }
  }

  // 1. Revalidação (SSoT) — tudo-ou-nada.
  const falhas: ImportarProdutosCsvLinhaFalha[] = []
  const validas: Array<{ linha: number; data: ProdutoImportRowParsed }> = []
  for (let i = 0; i < linhasRaw.length; i++) {
    const linha = i + 1
    const v = parseAndValidateImportRow(linhasRaw[i] ?? {}, {
      permiteAtualizacaoPorId: atualizarPorId,
    })
    if (!v.ok) {
      falhas.push({ linha, motivo: importCsvRowFailToString(v.reason, m) })
    } else {
      validas.push({ linha, data: v.data })
    }
  }
  if (falhas.length > 0) {
    return { success: true, criados: 0, atualizados: 0, falhas }
  }

  // 2. Pré-checagem de código de barras duplicado (só para linhas de criação).
  const criacao = validas.filter(({ data }) => !(typeof data.id === 'string' && data.id.length > 0))
  const barcodePorLinha = new Map<string, number[]>()
  for (const { linha, data } of criacao) {
    const cb = data.codigo_barras
    if (!cb) continue
    const arr = barcodePorLinha.get(cb) ?? []
    arr.push(linha)
    barcodePorLinha.set(cb, arr)
  }
  const dupFalhas: ImportarProdutosCsvLinhaFalha[] = []
  for (const [, linhas] of barcodePorLinha) {
    if (linhas.length > 1) {
      for (const linha of linhas) {
        dupFalhas.push({ linha, motivo: m.import_row_barcode_dup_lote })
      }
    }
  }

  const supabase = await createClient()

  const barcodesUnicos = [...barcodePorLinha.entries()]
    .filter(([, linhas]) => linhas.length === 1)
    .map(([cb]) => cb)
  if (barcodesUnicos.length > 0) {
    const { data: existentes, error: cbErr } = await supabase
      .from('produtos')
      .select('codigo_barras')
      .in('codigo_barras', barcodesUnicos)
    if (cbErr) {
      return {
        success: false,
        error: mensagemErroComSecao(m.import_lote_rollback_secao, cbErr.message, idioma),
      }
    }
    const existentesSet = new Set(
      (existentes ?? []).map((r) => (r as { codigo_barras: string | null }).codigo_barras),
    )
    for (const [cb, linhas] of barcodePorLinha) {
      if (linhas.length === 1 && existentesSet.has(cb)) {
        dupFalhas.push({ linha: linhas[0], motivo: m.import_row_barcode_exists })
      }
    }
  }
  if (dupFalhas.length > 0) {
    dupFalhas.sort((a, b) => a.linha - b.linha)
    return { success: true, criados: 0, atualizados: 0, falhas: dupFalhas }
  }

  // 3. Gravação com rollback seguro (create via ProductWriter).
  const criadosIds: string[] = []
  const snapshotsUpdate: Array<{ id: string; prev: Record<string, unknown> }> = []

  async function reverter(): Promise<void> {
    for (let i = snapshotsUpdate.length - 1; i >= 0; i--) {
      const s = snapshotsUpdate[i]
      await supabase.from('produtos').update(s.prev).eq('id', s.id)
    }
    if (criadosIds.length > 0) {
      await supabase.from('estoque').delete().in('produto_id', criadosIds)
      await supabase.from('produtos').delete().in('id', criadosIds)
    }
  }

  let criados = 0
  let atualizados = 0

  for (const { linha, data } of validas) {
    const idPreenchido = typeof data.id === 'string' && data.id.length > 0

    if (atualizarPorId && idPreenchido) {
      const { data: existente, error: exErr } = await supabase
        .from('produtos')
        .select(IMPORT_MERGE_COLS)
        .eq('id', data.id)
        .maybeSingle()
      if (exErr || !existente) {
        await reverter()
        return {
          success: true,
          criados: 0,
          atualizados: 0,
          falhas: [
            {
              linha,
              motivo: exErr
                ? mensagemErroComSecao(m.import_row_atualizar_secao, exErr.message, idioma)
                : interpolateTemplate(m.import_row_id_nao_encontrado, { id: data.id }),
            },
          ],
        }
      }
      snapshotsUpdate.push({
        id: data.id,
        prev: existente as unknown as Record<string, unknown>,
      })

      const up = await atualizarProdutoViaImportRow(supabase, data, idioma, m)
      if (!up.ok) {
        await reverter()
        return {
          success: true,
          criados: 0,
          atualizados: 0,
          falhas: [{ linha, motivo: up.error }],
        }
      }
      atualizados++
      continue
    }

    const result = await criarProdutoAction(mapImportRowToCreateProductInput(data))
    if (!result.ok) {
      await reverter()
      return {
        success: true,
        criados: 0,
        atualizados: 0,
        falhas: [{ linha, motivo: result.error }],
      }
    }
    criadosIds.push(result.product.id)
    criados++
  }

  return { success: true, criados, atualizados, falhas: [] }
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

const ProdutoIdSchema = z.string().uuid('ID do produto inválido.')

/** Status atual gravado — leitura pessimista (ausente → null, ninguém publica por engano). */
async function lerStatusPublicacao(produtoId: string): Promise<StatusPublicacao | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('produtos')
    .select('status_publicacao')
    .eq('id', produtoId)
    .maybeSingle()
  return (data?.status_publicacao ?? null) as StatusPublicacao | null
}

/** Facade — lifecycle via ProductLifecycleService. */
export async function alternarAtivoProduto(
  produtoId: string,
  ativo: boolean,
): Promise<ActionResult<null>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const status = statusFromAtivoLegacy(ativo)
  const result = await setProductStatusAction(produtoId, status)
  if (!result.ok) return { success: false, error: result.error }
  return { success: true, data: null }
}

/**
 * Estreia de um rascunho (DRAFT → PUBLICADO).
 *
 * A regra `podePublicarProduto` é imposta AQUI, não só na UI: Server Action é
 * endpoint público, e regra que só a tela respeita não é regra. Para trazer de
 * volta um produto aposentado use `reativarProduto` — transição diferente, nome
 * diferente. Ver Jinlong/decisoes/CATALOGO_CATEGORIA_INATIVA_E_PUBLICAR.md.
 */
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

  const atual = await lerStatusPublicacao(parsed.data)
  if (!podePublicarProduto(atual)) {
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: getMessages(idioma).produtos.publicar_apenas_rascunho }
  }

  const result = await setProductStatusAction(parsed.data, 'PUBLICADO')
  if (!result.ok) return { success: false, error: result.error }
  return { success: true, data: null }
}

/** Retorno de um produto aposentado (INATIVO → PUBLICADO). Transição explícita. */
export async function reativarProduto(produtoId: string): Promise<ActionResult<null>> {
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

  const result = await setProductStatusAction(parsed.data, 'PUBLICADO')
  if (!result.ok) return { success: false, error: result.error }
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

  const result = await setProductStatusAction(parsed.data, 'INATIVO')
  if (!result.ok) return { success: false, error: result.error }
  return { success: true, data: null }
}

const LotePublicacaoSchema = z.object({
  produto_ids: z.array(z.string().uuid()).min(1).max(200),
})

/** Status gravados de vários produtos numa ida só — mesma leitura pessimista da via unitária. */
async function lerStatusPublicacaoLote(
  produtoIds: string[],
): Promise<Map<string, StatusPublicacao | null>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('produtos')
    .select('id, status_publicacao')
    .in('id', produtoIds)
  const linhas = (data ?? []) as { id: string; status_publicacao: StatusPublicacao | null }[]
  return new Map(linhas.map((l) => [l.id, l.status_publicacao ?? null]))
}

/**
 * Estreia de rascunhos em lote (DRAFT → PUBLICADO).
 *
 * O gate `podePublicarProduto` vale AQUI pelo mesmo motivo da via unitária: é
 * Server Action, endpoint público. Sem isto o lote seria o buraco por onde a
 * regra vaza — bastaria selecionar um INATIVO na lista para republicá-lo sem
 * passar por `reativarProduto`, que é a transição própria para isso.
 *
 * Produtos não publicáveis são descartados em silêncio, não derrubam o lote: o
 * contrato de retorno é `publicados`, então publicar menos do que foi
 * selecionado já é um resultado que a UI sabe exibir. Se nada sobrar, é erro.
 */
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

  const statusAtuais = await lerStatusPublicacaoLote(parsed.data.produto_ids)
  const publicaveis = parsed.data.produto_ids.filter((id) =>
    podePublicarProduto(statusAtuais.get(id) ?? null),
  )
  if (publicaveis.length === 0) {
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: getMessages(idioma).produtos.publicar_apenas_rascunho }
  }

  const result = await setProductStatusLoteAction(publicaveis, 'PUBLICADO')
  if (!result.ok) return { success: false, error: result.error }
  return { success: true, data: { publicados: result.atualizados } }
}

const LoteExclusaoSchema = z.object({
  produto_ids: z.array(z.string().uuid()).min(1).max(100),
})

export type ResultadoExclusaoLote = Readonly<{
  removidos: number
  inativados: number
  ja_inativos: number
  falhas: ReadonlyArray<{ produto_id: string; motivo: string }>
}>

/**
 * Facade UI — lote via ProductExclusionService (admin/produtos).
 * Contrato UI: contadores removidos/inativados/ja_inativos + falhas.
 */
export async function aplicarExclusaoOuInativacaoEmLote(
  rawIds: unknown,
): Promise<{ success: true; data: ResultadoExclusaoLote } | { success: false; error: string }> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const { idioma } = await getUsuarioIdioma()

  const parsed = LoteExclusaoSchema.safeParse(rawIds)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Erro de validação.'
    return { success: false, error: mensagemErroValidacaoZod(msg, idioma) }
  }

  const ids = [...new Set(parsed.data.produto_ids)]
  const falhas: { produto_id: string; motivo: string }[] = []
  let removidos = 0
  let inativados = 0
  let ja_inativos = 0

  for (const id of ids) {
    const result = await excluirProdutoAction(id)
    if (!result.ok) {
      falhas.push({ produto_id: id, motivo: result.error })
      continue
    }
    if (result.outcome === 'deleted') removidos++
    else if (result.outcome === 'inactivated') inativados++
    else ja_inativos++
  }

  return {
    success: true,
    data: { removidos, inativados, ja_inativos, falhas },
  }
}

/**
 * Facade UI — Zod + lifecycle + update via ProductUpdater (admin/produtos).
 * Contrato UI: `{ success, data: null | error }`.
 */
export async function atualizarDadosProdutoGerente(
  input: unknown,
): Promise<ActionResult<null>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const asDraft = isIntencaoRascunho((input as { status_publicacao?: unknown }).status_publicacao)
  const parsed = asDraft
    ? EditarProdutoRascunhoSchema.safeParse(input)
    : EditarProdutoCatalogoSchema.safeParse(input)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Erro de validação.'
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod(msg, idioma) }
  }

  const supabase = await createClient()
  const { data: atualRow } = await supabase
    .from('produtos')
    .select('status_publicacao')
    .eq('id', parsed.data.produto_id)
    .maybeSingle()
  const statusAtual = (atualRow?.status_publicacao ?? null) as StatusPublicacao | null
  const lifecycle = lifecycleAoEditarProduto(asDraft, statusAtual)

  const result = await atualizarProdutoAction(
    parsed.data.produto_id,
    mapFormToUpdateProductInput(parsed.data, lifecycle),
  )
  if (!result.ok) return { success: false, error: result.error }
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
  /**
   * `ativo` acompanha a categoria porque o formulário precisa distinguir "não
   * ofereço mais" de "não existe": a categoria inativa some das escolhas novas,
   * mas continua visível no produto que já a usa (senão salvar apagaria o
   * vínculo). Ver `Jinlong/decisoes/CATALOGO_CATEGORIA_INATIVA_E_PUBLICAR.md`.
   */
  categorias: { id: string; nome: string; ativo?: boolean }[]
  /** `ativo` pelo mesmo motivo de `categorias` — ver nota acima. */
  marcas: { id: string; nome: string; ativo?: boolean }[]
  fornecedores: { id: string; nome: string }[]
}

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
      supabase.from('categorias').select('id, nome, ativo').order('nome', { ascending: true }),
      supabase.from('marcas').select('id, nome, ativo').order('nome', { ascending: true }),
      supabase.from('fornecedores').select('id, nome').order('nome', { ascending: true }),
    ])
    return {
      categorias: ((cat.data ?? []) as { id: string; nome: string; ativo?: boolean }[]),
      marcas: ((mar.data ?? []) as { id: string; nome: string; ativo?: boolean }[]),
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

/**
 * Facade UI — listagem filtrada via ProductReader.listComFiltros.
 * Contrato UI: `{ success, data: { rows: ProdutoGerenteRow[], total } }`.
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
  const result = await buscarProdutosComFiltrosAction({
    situacao: p.situacao,
    origem: p.origem,
    nf: p.nf,
    estoque: p.estoque,
    imagens: p.imagens,
    tags: p.tags,
    categoriaId: p.categoriaId,
    marcaId: p.marcaId,
    fornecedorId: p.fornecedorId,
    busca: p.busca,
    page: p.page,
    pageSize: p.pageSize,
  })
  if (!result.ok) return { success: false, error: result.error }
  return {
    success: true,
    data: {
      rows: result.rows.map(mapListRowToGerente),
      total: result.total,
    },
  }
}

// ─── Bulk: ativar / inativar em lote ─────────────────────────────────────────

const LoteAtivoSchema = z.object({
  produto_ids: z.array(z.string().uuid()).min(1).max(200),
  ativo: z.boolean(),
})

/**
 * Ativar/inativar em lote (via legada `ativo`).
 *
 * Ativar significa `PUBLICADO`, então este caminho é publicação e passa pelo
 * MESMO gate `podePublicarProduto` das vias `publicarProduto`/`publicarProdutosLote`.
 * Sem isto ele seria uma porta lateral para o mesmo destino: bastava usar
 * "Ativar" em vez de "Publicar" para estrear um DRAFT ou republicar um INATIVO
 * sem passar por `reativarProduto`. Regra imposta em um só dos caminhos que
 * levam a PUBLICADO não é regra em nenhum.
 *
 * Inativar não tem gate: qualquer status pode ir para INATIVO.
 */
export async function alterarAtivoLoteProdutos(
  rawIds: string[],
  ativo: boolean,
): Promise<ActionResult<{ atualizados: number }>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = LoteAtivoSchema.safeParse({ produto_ids: rawIds, ativo })
  if (!parsed.success) {
    const { idioma } = await getUsuarioIdioma()
    return {
      success: false,
      error: mensagemErroValidacaoZod(parsed.error.issues[0]?.message ?? 'Erro', idioma),
    }
  }

  let alvos = parsed.data.produto_ids
  if (parsed.data.ativo) {
    const statusAtuais = await lerStatusPublicacaoLote(alvos)
    alvos = alvos.filter((id) => podePublicarProduto(statusAtuais.get(id) ?? null))
    if (alvos.length === 0) {
      const { idioma } = await getUsuarioIdioma()
      return { success: false, error: getMessages(idioma).produtos.publicar_apenas_rascunho }
    }
  }

  const status = statusFromAtivoLegacy(parsed.data.ativo)
  const result = await setProductStatusLoteAction(alvos, status)
  if (!result.ok) return { success: false, error: result.error }
  return { success: true, data: { atualizados: result.atualizados } }
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

  const parsed = LoteCategoriaSchema.safeParse({
    produto_ids: rawIds,
    categoria_id: categoriaId,
  })
  if (!parsed.success) {
    const { idioma } = await getUsuarioIdioma()
    return {
      success: false,
      error: mensagemErroValidacaoZod(parsed.error.issues[0]?.message ?? 'Erro', idioma),
    }
  }

  const result = await updateCategoriaLoteAction(
    parsed.data.produto_ids,
    parsed.data.categoria_id,
  )
  if (!result.ok) return { success: false, error: result.error }
  return { success: true, data: { atualizados: result.atualizados } }
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

// ─── Tela de detalhe (somente leitura) /admin/catalogo/[id] ─────────────────

export type ProdutoDetalhe = {
  id: string
  nome: string
  codigo_interno: string | null
  codigo_barras: string | null
  categoria_id: string | null
  marca_id: string | null
  unidade_medida: string
  preco_varejo: number
  preco_atacado: number | null
  quantidade_gatilho_atacado: number | null
  quantidade_atual: number | null
  estoque_minimo: number | null
  localizacao_prateleira: string | null
  ativo: boolean
  status_publicacao: StatusPublicacao
}

/**
 * Facade — catálogo via ProductReader; saldo = snapshot inventory (read-through).
 */
export async function buscarProdutoDetalhe(produtoId: string): Promise<ActionResult<ProdutoDetalhe>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const idValido = z.string().uuid().safeParse(produtoId)
  if (!idValido.success) {
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod('ID do produto inválido.', idioma) }
  }

  const catalog = await buscarProdutoPorIdAction(produtoId)
  if (!catalog.ok) return { success: false, error: catalog.error }

  const supabase = await createClient()
  const { data: estoque } = await supabase
    .from('estoque')
    .select('quantidade_atual, estoque_minimo')
    .eq('produto_id', produtoId)
    .maybeSingle()

  const p = catalog.product
  const e = estoque as { quantidade_atual?: number; estoque_minimo?: number } | null
  return {
    success: true,
    data: {
      id: p.id,
      nome: p.nome,
      codigo_interno: p.codigoInterno,
      codigo_barras: p.codigoBarras,
      categoria_id: p.categoriaId,
      marca_id: p.marcaId,
      unidade_medida: 'UN',
      preco_varejo: p.precoVarejo,
      preco_atacado: p.precoAtacado,
      quantidade_gatilho_atacado: null,
      quantidade_atual: e?.quantidade_atual ?? null,
      estoque_minimo: e?.estoque_minimo ?? null,
      localizacao_prateleira: null,
      ativo: p.ativo,
      status_publicacao: p.statusPublicacao,
    },
  }
}
