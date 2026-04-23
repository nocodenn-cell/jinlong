'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteOuDono } from '@/lib/auth/gerenteOuDono'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import {
  mensagemErroComSecao,
  mensagemErroValidacaoZod,
} from '@/lib/errors/mensagemErroUsuario'
import { AtualizarEstoqueSchema, ProdutoIdSchema } from './actions.validation'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'

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

export async function atualizarEstoqueProduto(
  input: unknown
): Promise<ActionResult> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = AtualizarEstoqueSchema.safeParse(input)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join('; ')
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod(msg, idioma) }
  }

  const supabase = await createClient()
  const lojaId = await lojaIdDoUsuarioLogado()
  if (!lojaId) return { success: false, error: 'Não foi possível identificar sua loja. Faça login novamente.' }

  const observacao = parsed.data.observacao?.trim() || null
  const { error } = await supabase.rpc('ajustar_estoque_manual', {
    p_produto_id: parsed.data.produto_id,
    p_loja_id: lojaId,
    p_quantidade_atual: parsed.data.quantidade_atual,
    p_estoque_minimo: parsed.data.estoque_minimo,
    p_motivo_codigo: parsed.data.motivo,
    p_observacao: observacao,
  })

  if (error) {
    return { success: false, error: mensagemErroComSecao('Estoque', error.message) }
  }

  revalidatePath('/gerente/estoque')
  return { success: true, data: null }
}

/**
 * Produtos legados sem linha em `estoque`: cria registro inicial (0 / 0).
 */
export async function garantirLinhaEstoque(input: unknown): Promise<ActionResult> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = ProdutoIdSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Produto inválido' }
  }

  const supabase = await createClient()
  const lojaId = await lojaIdDoUsuarioLogado()
  if (!lojaId) return { success: false, error: 'Não foi possível identificar sua loja. Faça login novamente.' }

  const { error } = await supabase.from('estoque').insert({
    produto_id: parsed.data.produto_id,
    loja_id: lojaId,
    quantidade_atual: 0,
    estoque_minimo: 0,
  })

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'Estoque já existe para este produto.' }
    }
    return { success: false, error: mensagemErroComSecao('Estoque', error.message) }
  }

  revalidatePath('/gerente/estoque')
  return { success: true, data: null }
}

export type EstoqueRowDTO = {
  id: string
  quantidade_atual: number
  estoque_minimo: number
}

export type ProdutoComEstoqueDTO = {
  id: string
  nome: string
  codigo_barras: string | null
  unidade_medida: string
  estoque: EstoqueRowDTO | null
}

export type EstoqueBaixoRowDTO = {
  id: string
  nome: string
  codigo_barras: string | null
  origem: string
  loja_nome?: string | null
  quantidade_atual: number
  estoque_minimo: number
  deficit: number
}

export type EstoqueGerenteData =
  | { modo: 'todos'; produtos: ProdutoComEstoqueDTO[] }
  | { modo: 'baixo'; linhas: EstoqueBaixoRowDTO[] }

/** Carga da tela de estoque (RLS + sessão do usuário). */
export async function obterDadosEstoqueGerente(filtro: 'todos' | 'baixo'): Promise<EstoqueGerenteData> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  let lojaId = LOJA_MATRIZ_ID
  if (user) {
    const { data: urow } = await supabase
      .from('usuarios')
      .select('loja_id')
      .eq('id', user.id)
      .maybeSingle()
    if (urow?.loja_id) lojaId = urow.loja_id as string
  }

  if (filtro === 'baixo') {
    const { data } = await supabase
      .from('v_estoque_baixo')
      .select(
        'id, nome, codigo_barras, origem, loja_id, loja_nome, quantidade_atual, estoque_minimo, deficit',
      )
      .eq('loja_id', lojaId)
    return { modo: 'baixo', linhas: (data ?? []) as EstoqueBaixoRowDTO[] }
  }

  const { data: plist } = await supabase
    .from('produtos')
    .select('id, nome, codigo_barras, unidade_medida')
    .eq('ativo', true)
    .order('nome', { ascending: true })

  const { data: estRows } = await supabase
    .from('estoque')
    .select('id, produto_id, quantidade_atual, estoque_minimo')
    .eq('loja_id', lojaId)

  const estMap = new Map((estRows ?? []).map((e) => [e.produto_id as string, e]))
  const produtos: ProdutoComEstoqueDTO[] =
    plist?.map((p) => {
      const row = estMap.get(p.id)
      return {
        ...p,
        estoque: row
          ? {
              id: row.id as string,
              quantidade_atual: Number(row.quantidade_atual),
              estoque_minimo: Number(row.estoque_minimo),
            }
          : null,
      }
    }) ?? []

  return { modo: 'todos', produtos }
}

export async function atualizarEstoqueProdutoThrow(input: unknown): Promise<void> {
  const r = await atualizarEstoqueProduto(input)
  if (!r.success) throw new Error(r.error)
}

export async function garantirLinhaEstoqueThrow(input: unknown): Promise<void> {
  const r = await garantirLinhaEstoque(input)
  if (!r.success) throw new Error(r.error)
}
