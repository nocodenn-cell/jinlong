'use server'

import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import {
  mensagemErroComSecao,
  mensagemErroValidacaoZod,
} from '@/lib/errors/mensagemErroUsuario'
import {
  buscarProdutoPorCodigoSchema,
  buscarProdutosPorCategoriaSchema,
  buscarEstoqueAtualSchema,
} from './actions.validation'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getGerenteLojaId } from '@/lib/gerente/auth/sessionContext'
import type { ProdutoComEstoqueDTO } from '@/lib/etiqueta/types'

type ActionResult<T = null> =
  | { success: true; data: T }
  | { success: false; error: string }

type EstoqueJoinRow = { quantidade_atual: unknown; estoque_minimo: unknown }

type ProdutoComEstoqueSelectRow = {
  id: string
  nome: string
  codigo_barras: string | null
  preco_varejo: number | null
  unidade_medida: string | null
  estoque: EstoqueJoinRow | EstoqueJoinRow[]
}

function normalizaEstoqueDaRow(estoque: ProdutoComEstoqueSelectRow['estoque']): {
  quantidade_atual: number
  estoque_minimo: number
} {
  const row = Array.isArray(estoque) ? estoque[0] : estoque
  return {
    quantidade_atual: Number(row?.quantidade_atual ?? 0),
    estoque_minimo: Number(row?.estoque_minimo ?? 0),
  }
}

function rowParaProdutoComEstoqueDTO(p: ProdutoComEstoqueSelectRow): ProdutoComEstoqueDTO {
  const estoque = normalizaEstoqueDaRow(p.estoque)
  return {
    id: p.id,
    nome: p.nome,
    codigo_barras: p.codigo_barras || '',
    preco_varejo: Number(p.preco_varejo ?? 0),
    unidade_medida: p.unidade_medida ?? 'UN',
    quantidade_atual: estoque.quantidade_atual,
    estoque_minimo: estoque.estoque_minimo,
  }
}

async function lojaIdDoUsuarioLogado(): Promise<string | null> {
  return getGerenteLojaId()
}

/**
 * Busca produto por código de barras com dados de estoque da loja do usuário.
 */
export async function buscarProdutoPorCodigo(
  codigoBarras: string
): Promise<ActionResult<ProdutoComEstoqueDTO>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const lojaId = await lojaIdDoUsuarioLogado()
  if (!lojaId) {
    const { idioma } = await getUsuarioIdioma()
    return { 
      success: false, 
      error: mensagemErroComSecao('Impressão de Etiquetas', 'Não foi possível identificar sua loja. Faça login novamente.', idioma) 
    }
  }

  const parsed = buscarProdutoPorCodigoSchema.safeParse({ codigo_barras: codigoBarras, loja_id: lojaId })
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join('; ')
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod(msg, idioma) }
  }

  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('produtos')
    .select(`
      id,
      nome,
      codigo_barras,
      preco_varejo,
      unidade_medida,
      estoque!inner (
        quantidade_atual,
        estoque_minimo
      )
    `)
    .eq('codigo_barras', parsed.data.codigo_barras)
    .eq('estoque.loja_id', lojaId)
    .eq('ativo', true)
    .maybeSingle()

  if (error || !data) {
    const { idioma } = await getUsuarioIdioma()
    return { 
      success: false, 
      error: idioma === 'zh' 
        ? '未找到该条形码的产品' 
        : 'Produto não encontrado para este código de barras' 
    }
  }

  const produto = data as ProdutoComEstoqueSelectRow

  return {
    success: true,
    data: rowParaProdutoComEstoqueDTO(produto),
  }
}

/**
 * Busca estoque atual de múltiplos produtos.
 */
export async function buscarEstoqueAtual(
  produtoIds: string[]
): Promise<ActionResult<ProdutoComEstoqueDTO[]>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const lojaId = await lojaIdDoUsuarioLogado()
  if (!lojaId) {
    const { idioma } = await getUsuarioIdioma()
    return { 
      success: false, 
      error: mensagemErroComSecao('Impressão de Etiquetas', 'Não foi possível identificar sua loja. Faça login novamente.', idioma) 
    }
  }

  const parsed = buscarEstoqueAtualSchema.safeParse({ produto_ids: produtoIds, loja_id: lojaId })
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join('; ')
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod(msg, idioma) }
  }

  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('produtos')
    .select(`
      id,
      nome,
      codigo_barras,
      preco_varejo,
      unidade_medida,
      estoque!inner (
        quantidade_atual,
        estoque_minimo
      )
    `)
    .in('id', parsed.data.produto_ids)
    .eq('estoque.loja_id', lojaId)
    .eq('ativo', true)

  if (error) {
    const { idioma } = await getUsuarioIdioma()
    return { 
      success: false, 
      error: mensagemErroComSecao('Impressão de Etiquetas', error.message, idioma) 
    }
  }

  const produtos = (data ?? []) as ProdutoComEstoqueSelectRow[]
  const resultado: ProdutoComEstoqueDTO[] = produtos.map(rowParaProdutoComEstoqueDTO)

  return { success: true, data: resultado }
}

/**
 * Busca produtos por categoria (para funcionalidade de seleção por categoria).
 */
export async function buscarProdutosPorCategoria(
  categoriaId?: string
): Promise<ActionResult<ProdutoComEstoqueDTO[]>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const lojaId = await lojaIdDoUsuarioLogado()
  if (!lojaId) {
    const { idioma } = await getUsuarioIdioma()
    return { 
      success: false, 
      error: mensagemErroComSecao('Impressão de Etiquetas', 'Não foi possível identificar sua loja. Faça login novamente.', idioma) 
    }
  }

  const parsed = buscarProdutosPorCategoriaSchema.safeParse({ categoria_id: categoriaId, loja_id: lojaId })
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join('; ')
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod(msg, idioma) }
  }

  const supabase = await createClient()
  
  let query = supabase
    .from('produtos')
    .select(`
      id,
      nome,
      codigo_barras,
      preco_varejo,
      unidade_medida,
      estoque!inner (
        quantidade_atual,
        estoque_minimo
      )
    `)
    .eq('estoque.loja_id', lojaId)
    .eq('ativo', true)

  if (parsed.data.categoria_id) {
    query = query.eq('categoria_id', parsed.data.categoria_id)
  }

  const { data, error } = await query

  if (error) {
    const { idioma } = await getUsuarioIdioma()
    return { 
      success: false, 
      error: mensagemErroComSecao('Impressão de Etiquetas', error.message, idioma) 
    }
  }

  const produtos = (data ?? []) as ProdutoComEstoqueSelectRow[]
  const resultado: ProdutoComEstoqueDTO[] = produtos.map(rowParaProdutoComEstoqueDTO)

  return { success: true, data: resultado }
}
