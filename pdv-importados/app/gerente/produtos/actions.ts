'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { LOJA_MATRIZ_ID, getLojaIdUsuario } from '@/lib/auth/lojaUsuario'
import { assertGerenteOuDono } from '@/lib/auth/gerenteOuDono'
import { createProdutoRepository } from '@/lib/adapters/supabase/produtoRepository'
import {
  criarProdutoComEstoque,
  alternarAtivoProduto as alternarAtivoNoDominio,
} from '@/core/services/produtoService'
import {
  mensagemErroComSecao,
  mensagemErroValidacaoZod,
} from '@/lib/errors/mensagemErroUsuario'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import type { ProdutoGerenteRow } from './produtoGerenteTypes'

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

async function lojaIdParaListagemProdutos(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id) return LOJA_MATRIZ_ID
  const loja = await getLojaIdUsuario(supabase, user.id)
  return loja ?? LOJA_MATRIZ_ID
}

/**
 * Opções para selects de filtros (categorias, marcas, fornecedores).
 */
export async function listarOpcoesFiltrosProdutos(): Promise<ActionResult<OpcoesFiltrosProdutos>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  const [cat, mar, forn] = await Promise.all([
    supabase.from('categorias').select('id, nome').order('nome', { ascending: true }),
    supabase.from('marcas').select('id, nome').eq('ativo', true).order('nome', { ascending: true }),
    supabase.from('fornecedores').select('id, nome').order('nome', { ascending: true }),
  ])

  if (cat.error || mar.error || forn.error) {
    const msg = [cat.error?.message, mar.error?.message, forn.error?.message].filter(Boolean).join(' · ')
    return { success: false, error: msg || 'Falha ao carregar opções de filtro.' }
  }

  return {
    success: true,
    data: {
      categorias: (cat.data ?? []) as { id: string; nome: string }[],
      marcas: (mar.data ?? []) as { id: string; nome: string }[],
      fornecedores: (forn.data ?? []) as { id: string; nome: string }[],
    },
  }
}

type RpcProdutoRow = {
  id: string
  nome: string
  codigo_barras: string | null
  preco_varejo: number
  origem: string
  tem_nf: boolean
  ativo: boolean
  categoria_id: string | null
  fornecedor_id: string | null
  marca_id: string | null
  imagem_url: string | null
  tags: string[] | null
  total_count: number
}

/**
 * Lista produtos com filtros e paginação (server-side via RPC).
 */
export async function buscarProdutosComFiltros(
  input: unknown,
): Promise<ActionResult<{ rows: ProdutoGerenteRow[]; total: number }>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = BuscarProdutosComFiltrosInputSchema.safeParse(input)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join('; ')
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod(msg, idioma) }
  }

  const p = parsed.data
  const supabase = await createClient()
  const lojaId = await lojaIdParaListagemProdutos(supabase)

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
      error: mensagemErroComSecao(
        'Produtos',
        error.message,
      ),
    }
  }

  const list = (data ?? []) as RpcProdutoRow[]
  const total = list.length > 0 ? Number(list[0].total_count) : 0
  const rows: ProdutoGerenteRow[] = list.map((r) => ({
    id: r.id,
    nome: r.nome,
    codigo_barras: r.codigo_barras,
    preco_varejo: Number(r.preco_varejo),
    origem: r.origem,
    tem_nf: r.tem_nf,
    ativo: r.ativo,
  }))

  return { success: true, data: { rows, total } }
}

/**
 * Export CSV: até `limite` linhas com os mesmos filtros da listagem.
 */
export async function buscarProdutosParaExportacao(
  input: unknown,
  limite: number,
): Promise<ActionResult<ProdutoGerenteRow[]>> {
  const auth = await assertGerenteOuDono()
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
