'use server'

import { createClient } from '@/lib/supabase/server'
import { mapRegraPrecoRow, type RegraPrecoRow } from '@/core/caixa/mapRegrasPreco'
import type { RegraPreco } from '@/core/pricing/types'

export type ProdutoCaixaDTO = {
  id: string
  nome: string
  codigo_barras: string | null
  preco_varejo: number
  categoria_id: string | null
  /** Estoque atual (se houver linha em `estoque`) */
  quantidade_estoque: number | null
}

export type CarregarRegrasResult =
  | { ok: true; regras: RegraPreco[] }
  | { ok: false; error: string }

export type BuscarProdutoResult =
  | { ok: true; status: 'encontrado'; produto: ProdutoCaixaDTO }
  | { ok: true; status: 'nao_encontrado' }
  | { ok: true; status: 'ambiguo'; mensagem: string }
  | { ok: false; error: string }

/** Remove caracteres perigosos para padrão ILIKE. */
function sanitizeIlikeFragment(s: string): string {
  return s.replace(/[%_\\]/g, '').trim()
}

function mapProdutoRow(
  r: {
    id: string
    nome: string
    codigo_barras: string | null
    preco_varejo: number | string
    categoria_id: string | null
  },
  quantidade_estoque: number | null,
): ProdutoCaixaDTO {
  return {
    id: r.id,
    nome: r.nome,
    codigo_barras: r.codigo_barras,
    preco_varejo: Number(r.preco_varejo),
    categoria_id: r.categoria_id,
    quantidade_estoque,
  }
}

const PRODUTO_COLS = 'id, nome, codigo_barras, preco_varejo, categoria_id' as const

async function quantidadeEstoque(
  supabase: Awaited<ReturnType<typeof createClient>>,
  produtoId: string,
): Promise<number | null> {
  const { data } = await supabase
    .from('estoque')
    .select('quantidade_atual')
    .eq('produto_id', produtoId)
    .maybeSingle()
  if (!data || data.quantidade_atual === undefined || data.quantidade_atual === null) {
    return null
  }
  return Number(data.quantidade_atual)
}

/**
 * Regras ativas para o motor de preço no caixa (RLS: qualquer autenticado lê).
 */
export async function carregarRegrasPrecoCaixa(): Promise<CarregarRegrasResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const { data, error } = await supabase
      .from('regras_preco')
      .select(
        'id, tipo_regra, produto_id, categoria_id, quantidade_minima, quantidade_maxima, tipo_desconto, valor_desconto, data_validade, ativo',
      )
      .eq('ativo', true)

    if (error) {
      return { ok: false, error: error.message }
    }

    const regras = (data as RegraPrecoRow[] | null)?.map(mapRegraPrecoRow) ?? []
    return { ok: true, regras }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao carregar regras'
    return { ok: false, error: msg }
  }
}

/**
 * 1) Código de barras exato (ativo).
 * 2) Nome ILIKE (ativo), no máx. 2 linhas — se mais de uma, pede refinamento.
 */
export async function buscarProdutoParaCaixa(termo: string): Promise<BuscarProdutoResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const t = termo.trim()
    if (!t) return { ok: true, status: 'nao_encontrado' }

    const { data: porCodigo, error: errCodigo } = await supabase
      .from('produtos')
      .select(PRODUTO_COLS)
      .eq('ativo', true)
      .eq('codigo_barras', t)
      .maybeSingle()

    if (errCodigo) return { ok: false, error: errCodigo.message }
    if (porCodigo) {
      const q = await quantidadeEstoque(supabase, porCodigo.id)
      return {
        ok: true,
        status: 'encontrado',
        produto: mapProdutoRow(porCodigo, q),
      }
    }

    const frag = sanitizeIlikeFragment(t)
    if (frag.length < 2) {
      return { ok: true, status: 'nao_encontrado' }
    }

    const { data: porNome, error: errNome } = await supabase
      .from('produtos')
      .select(PRODUTO_COLS)
      .eq('ativo', true)
      .ilike('nome', `%${frag}%`)
      .limit(3)

    if (errNome) return { ok: false, error: errNome.message }
    const lista = porNome ?? []
    if (lista.length === 0) return { ok: true, status: 'nao_encontrado' }
    if (lista.length > 1) {
      return {
        ok: true,
        status: 'ambiguo',
        mensagem: `Vários produtos batem com “${frag}”. Use o código de barras ou refine o nome.`,
      }
    }

    const row = lista[0]
    const q = await quantidadeEstoque(supabase, row.id)
    return {
      ok: true,
      status: 'encontrado',
      produto: mapProdutoRow(row, q),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao buscar produto'
    return { ok: false, error: msg }
  }
}
