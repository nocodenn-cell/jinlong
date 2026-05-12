'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteOuDono } from '@/lib/auth/gerenteOuDono'
import { createProdutoRepository } from '@/lib/adapters/supabase/produtoRepository'
import {
  criarProdutoComEstoque,
  alternarAtivoProduto as alternarAtivoNoDominio,
} from '@/core/services/produtoService'
import type { NovoProdutoInput } from '@/core/ports/produto'
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
import { randomUUID } from 'crypto'

const NovoProdutoSchema = z.object({
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
      'Código de barras: mínimo 3 caracteres ou deixe em branco'
    ),
  preco_varejo: z.coerce.number().positive('O preço de varejo deve ser maior que zero.'),
  origem: z.enum(['china_manual', 'brasil_nf', 'brasil_sem_nf'], {
    errorMap: () => ({ message: 'Origem do produto inválida.' }),
  }),
  tem_nf: z.coerce.boolean(),
  /** Cadastro rápido não envia o campo; importação pode enviar explicitamente. */
  ativo: z.boolean().optional().transform((v) => v ?? true),
})

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function criarProduto(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = NovoProdutoSchema.safeParse(input)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join('; ')
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod(msg, idioma) }
  }

  const supabase = await createClient()
  const repo = createProdutoRepository(supabase)
  const result = await criarProdutoComEstoque(parsed.data, repo)

  if (result.success) {
    revalidatePath('/gerente/produtos')
  }
  return result
}

const AtualizarPrecoSchema = z.object({
  produto_id: z.string().uuid('ID do produto inválido.'),
  preco_varejo: z.coerce.number().positive('O preço de varejo deve ser maior que zero.'),
})

export async function atualizarPrecoVarejoProduto(
  input: unknown
): Promise<ActionResult<null>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = AtualizarPrecoSchema.safeParse(input)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join('; ')
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
  const auth = await assertGerenteOuDono()
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
      const { error: upErr } = await supabase
        .from('produtos')
        .update({
          nome: row.nome,
          codigo_barras: row.codigo_barras,
          preco_varejo: row.preco_varejo,
          origem: row.origem,
          tem_nf: row.tem_nf,
          ativo: row.ativo,
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
    revalidatePath('/gerente/produtos')
  }

  return { success: true, criados, atualizados, falhas }
}

export async function uploadImagemProduto(
  formData: FormData,
): Promise<ActionResult<{ imagem_url: string }>> {
  const auth = await assertGerenteOuDono()
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
  const objectPath = `${produtoId}/${randomUUID()}.${ext}`
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
  const auth = await assertGerenteOuDono()
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
  ativo: boolean
): Promise<ActionResult<null>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  const repo = createProdutoRepository(supabase)
  const result = await alternarAtivoNoDominio(produtoId, ativo, repo)

  if (!result.success) {
    return { success: false, error: result.error }
  }
  revalidatePath('/gerente/produtos')
  return { success: true, data: null }
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
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma).produtos

  const parsed = LoteExclusaoSchema.safeParse(rawIds)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join('; ')
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
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = EditarProdutoCatalogoSchema.safeParse(input)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join('; ')
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod(msg, idioma) }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('produtos')
    .update({
      nome: parsed.data.nome,
      codigo_barras: parsed.data.codigo_barras,
      origem: parsed.data.origem,
      tem_nf: parsed.data.tem_nf,
    })
    .eq('id', parsed.data.produto_id)

  if (error) {
    const { idioma } = await getUsuarioIdioma()
    return {
      success: false,
      error: mensagemErroComSecao('Produto', error.message, idioma),
    }
  }

  revalidatePath('/gerente/produtos')
  return { success: true, data: null }
}
