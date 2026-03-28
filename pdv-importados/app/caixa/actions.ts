'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { mapRegraPrecoRow, type RegraPrecoRow } from '@/core/caixa/mapRegrasPreco'
import type { RegraPreco } from '@/core/pricing/types'
import {
  finalizarVendaInputSchema,
  roundMoney2,
  totaisFromItens,
  totalsMatchDeclared,
} from '@/app/caixa/finalizarVendaValidation'

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

export type FinalizarVendaCaixaResult =
  | { ok: true; vendaId: string }
  | { ok: false; error: string }

/**
 * Persiste venda + itens no Supabase e aplica baixa de estoque via RPC
 * `decrementar_estoque_idempotente` (migration 007 + GRANT 009 para `authenticated`).
 */
export async function finalizarVendaCaixa(raw: unknown): Promise<FinalizarVendaCaixaResult> {
  const parsed = finalizarVendaInputSchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((e) => e.message).join('; ')
    return { ok: false, error: `Dados inválidos: ${msg}` }
  }
  const input = parsed.data
  const computed = totaisFromItens(input.itens)
  if (!totalsMatchDeclared(computed, input)) {
    return {
      ok: false,
      error: 'Totais do carrinho não batem com os itens. Atualize a página e tente de novo.',
    }
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const { data: caixaExistente } = await supabase
      .from('caixas')
      .select('id')
      .eq('operador_id', user.id)
      .eq('status', 'ABERTO')
      .maybeSingle()

    let caixaId: string | null = caixaExistente?.id ?? null
    if (!caixaId) {
      const { data: novo, error: caixaErr } = await supabase
        .from('caixas')
        .insert({ operador_id: user.id, valor_inicial: 0, status: 'ABERTO' })
        .select('id')
        .single()
      if (caixaErr) return { ok: false, error: `Caixa: ${caixaErr.message}` }
      caixaId = novo.id
    }

    const vendaId = crypto.randomUUID()
    // Sempre persistir totais derivados dos itens (fonte de verdade), não os números crus do cliente.
    const { error: vErr } = await supabase.from('vendas').insert({
      id: vendaId,
      caixa_id: caixaId,
      operador_id: user.id,
      total_bruto: computed.totalBruto,
      total_desconto: computed.totalDesconto,
      total_liquido: computed.totalLiquido,
      forma_pagamento: input.formaPagamento,
      status: 'CONCLUIDA',
    })
    if (vErr) return { ok: false, error: vErr.message }

    const itensRows = input.itens.map((i) => ({
      venda_id: vendaId,
      produto_id: i.produtoId,
      quantidade: i.quantidade,
      preco_unitario_original: roundMoney2(i.precoOriginal),
      preco_unitario: roundMoney2(i.precoUnitario),
      desconto_unitario: roundMoney2(i.descontoUnitario),
      tipo_preco: i.tipoPreco,
    }))

    const { error: iErr } = await supabase.from('itens_venda').insert(itensRows)
    if (iErr) return { ok: false, error: `Itens: ${iErr.message}` }

    for (const i of input.itens) {
      const { error: rpcErr } = await supabase.rpc('decrementar_estoque_idempotente', {
        p_produto_id: i.produtoId,
        p_quantidade: i.quantidade,
        p_venda_id: vendaId,
      })
      if (rpcErr) return { ok: false, error: `Estoque: ${rpcErr.message}` }
    }

    revalidatePath('/gerente/vendas')
    return { ok: true, vendaId }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao finalizar venda'
    return { ok: false, error: msg }
  }
}
