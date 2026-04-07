'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertSupabasePublicEnv } from '@/lib/supabase/env'
import { mapRegraPrecoRow, type RegraPrecoRow } from '@/core/caixa/mapRegrasPreco'
import type { RegraPreco } from '@/core/pricing/types'
import { pricingService } from '@/core/pricing/PricingService'
import type { ItemCarrinho } from '@/core/cart/types'
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

export type ValidarGerenteDescontoResult =
  | { ok: true; token: string; expiraEm: string; maxDescontoPercentual: number }
  | { ok: false; error: string; scope?: string; lockUntil?: string }

type ItemAutoritativo = {
  produtoId: string
  quantidade: number
  precoOriginal: number
  precoUnitario: number
  descontoUnitario: number
  tipoPreco: 'VAREJO' | 'ATACADO' | 'MANUAL'
}

export async function validarGerenteDesconto(input: {
  senha: string
  lojaId?: string
  deviceFingerprint?: string
}): Promise<ValidarGerenteDescontoResult> {
  const senha = input.senha.trim()
  if (!senha) return { ok: false, error: 'Senha do gerente é obrigatória.' }
  if (senha.length > 128) return { ok: false, error: 'Senha inválida (máx. 128 caracteres).' }

  try {
    const supabase = await createClient()
    const {
      data: { session },
      error: sessionErr,
    } = await supabase.auth.getSession()

    if (sessionErr || !session?.access_token) {
      return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
    }

    const { url } = assertSupabasePublicEnv()
    const response = await fetch(`${url}/functions/v1/validar-gerente`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        'x-device-fingerprint': (input.deviceFingerprint ?? '').trim().toLowerCase().slice(0, 200),
      },
      body: JSON.stringify({
        senha,
        loja_id: input.lojaId?.trim() || undefined,
      }),
    })

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok || payload.ok !== true) {
      return {
        ok: false,
        error:
          typeof payload.error === 'string'
            ? payload.error
            : `Falha ao validar gerente (${response.status}).`,
        scope: typeof payload.scope === 'string' ? payload.scope : undefined,
        lockUntil: typeof payload.lock_until === 'string' ? payload.lock_until : undefined,
      }
    }

    return {
      ok: true,
      token: String(payload.token ?? ''),
      expiraEm: String(payload.expira_em ?? ''),
      maxDescontoPercentual: Number(payload.max_desconto_percentual ?? 0),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao validar gerente'
    return { ok: false, error: msg }
  }
}

async function recalcularItensNoServidor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itensInput: Array<{ produtoId: string; quantidade: number }>,
): Promise<{ ok: true; itens: ItemAutoritativo[] } | { ok: false; error: string }> {
  const produtosIds = Array.from(new Set(itensInput.map((i) => i.produtoId)))
  const { data: produtosRows, error: prodErr } = await supabase
    .from('produtos')
    .select('id, nome, preco_varejo, categoria_id, ativo')
    .in('id', produtosIds)
    .eq('ativo', true)

  if (prodErr) return { ok: false, error: `Produtos: ${prodErr.message}` }
  const produtos = new Map((produtosRows ?? []).map((p) => [p.id, p]))
  if (produtos.size !== produtosIds.length) {
    return { ok: false, error: 'Há itens inválidos/inativos no carrinho. Atualize e tente novamente.' }
  }

  const { data: regrasRows, error: regrasErr } = await supabase
    .from('regras_preco')
    .select(
      'id, tipo_regra, produto_id, categoria_id, quantidade_minima, quantidade_maxima, tipo_desconto, valor_desconto, data_validade, ativo',
    )
    .eq('ativo', true)
  if (regrasErr) return { ok: false, error: `Regras: ${regrasErr.message}` }
  const regras = (regrasRows as RegraPrecoRow[] | null)?.map(mapRegraPrecoRow) ?? []

  const quantidadePorProduto = itensInput.reduce<Record<string, number>>((acc, item) => {
    acc[item.produtoId] = (acc[item.produtoId] ?? 0) + item.quantidade
    return acc
  }, {})

  const itens: ItemAutoritativo[] = []
  for (const i of itensInput) {
    const p = produtos.get(i.produtoId)!
    const itemCarrinho: ItemCarrinho = {
      id: crypto.randomUUID(),
      produtoId: p.id,
      nome: p.nome,
      quantidade: i.quantidade,
      precoVariejo: Number(p.preco_varejo),
      categoriaId: p.categoria_id ?? undefined,
    }
    const preco = pricingService.calcularPreco(itemCarrinho, regras, quantidadePorProduto[i.produtoId])
    itens.push({
      produtoId: i.produtoId,
      quantidade: i.quantidade,
      precoOriginal: roundMoney2(preco.precoOriginal),
      precoUnitario: roundMoney2(preco.precoUnitario),
      descontoUnitario: roundMoney2(preco.descontoUnitario),
      tipoPreco: preco.tipoPreco,
    })
  }
  return { ok: true, itens }
}

/**
 * Persiste venda + itens no Supabase e aplica baixa de estoque via RPC
 * `decrementar_estoque_seguro` (migrations 016–017: atômico + validação de operador).
 */
export async function finalizarVendaCaixa(raw: unknown): Promise<FinalizarVendaCaixaResult> {
  const parsed = finalizarVendaInputSchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((e) => e.message).join('; ')
    return { ok: false, error: `Dados inválidos: ${msg}` }
  }
  const input = parsed.data
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const itensCliente = input.itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade }))
    const recalc = await recalcularItensNoServidor(supabase, itensCliente)
    if (!recalc.ok) return { ok: false, error: recalc.error }
    const itensAut = recalc.itens

    const computedBase = totaisFromItens(itensAut)
    const gerentePercentual = input.descontoGerentePercentual ?? null
    const hasDescontoGerente = !!input.descontoGerenteToken && gerentePercentual !== null
    const descontoGerenteValor = hasDescontoGerente
      ? roundMoney2((computedBase.totalLiquido * gerentePercentual) / 100)
      : 0
    const computedFinal = {
      totalBruto: computedBase.totalBruto,
      totalDesconto: roundMoney2(computedBase.totalDesconto + descontoGerenteValor),
      totalLiquido: roundMoney2(computedBase.totalLiquido - descontoGerenteValor),
    }

    if (!totalsMatchDeclared(computedFinal, input)) {
      return {
        ok: false,
        error:
          'Os preços/regras do carrinho mudaram. Reabra o caixa e tente novamente para recalcular.',
      }
    }

    // Pré-checagem de estoque (melhor UX; a RPC 016/017 é a fonte de verdade sob concorrência)
    const estoquesInsuficientes: string[] = []
    for (const item of itensAut) {
      const { data: estoqueData, error: estqErr } = await supabase
        .from('estoque')
        .select('quantidade_atual, produtos!inner(nome)')
        .eq('produto_id', item.produtoId)
        .maybeSingle()

      if (estqErr || !estoqueData) {
        estoquesInsuficientes.push(
          `Produto sem linha de estoque (id ${item.produtoId.slice(0, 8)}…).`,
        )
      } else if (Number(estoqueData.quantidade_atual) < item.quantidade) {
        const p = estoqueData.produtos
        const nomeProduto =
          (Array.isArray(p) ? p[0]?.nome : (p as { nome?: string } | null)?.nome) ?? 'Produto'
        estoquesInsuficientes.push(
          `${nomeProduto}: solicitado ${item.quantidade}, disponível ${estoqueData.quantidade_atual}`,
        )
      }
    }

    if (estoquesInsuficientes.length > 0) {
      return {
        ok: false,
        error: `Estoque insuficiente:\n${estoquesInsuficientes.join('\n')}`,
      }
    }

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
    const itensRpc = itensAut.map((i) => ({
      item_id: crypto.randomUUID(),
      produto_id: i.produtoId,
      quantidade: i.quantidade,
      preco_original: roundMoney2(i.precoOriginal),
      preco_unitario: roundMoney2(i.precoUnitario),
      tipo_preco: i.tipoPreco,
    }))

    const useUnifiedSalesFlow = process.env.USE_UNIFIED_SALES_FLOW === 'true'
    const strictManagerDiscountAuth = process.env.STRICT_MANAGER_DISCOUNT_AUTH === 'true'
    const rpcName = useUnifiedSalesFlow
      ? 'finalizar_venda_transacional_canonica_v2'
      : 'finalizar_venda_transacional'

    const rpcParams = useUnifiedSalesFlow
      ? {
          p_venda_id: vendaId,
          p_caixa_id: caixaId,
          p_operador_id: user.id,
          p_forma_pagamento: input.formaPagamento,
          p_total_bruto: computedFinal.totalBruto,
          p_total_desconto: computedFinal.totalDesconto,
          p_total_liquido: computedFinal.totalLiquido,
          p_itens: itensRpc,
          p_desconto_gerente_token: input.descontoGerenteToken ?? null,
          p_desconto_gerente_percentual: input.descontoGerentePercentual ?? null,
          p_strict_manager_discount_auth: strictManagerDiscountAuth,
        }
      : {
          p_venda_id: vendaId,
          p_caixa_id: caixaId,
          p_forma_pagamento: input.formaPagamento,
          p_total_bruto: computedFinal.totalBruto,
          p_total_desconto: computedFinal.totalDesconto,
          p_total_liquido: computedFinal.totalLiquido,
          p_itens: itensRpc,
          p_desconto_gerente_token: input.descontoGerenteToken ?? null,
          p_desconto_gerente_percentual: input.descontoGerentePercentual ?? null,
        }

    const { error: txErr } = await supabase.rpc(rpcName, rpcParams)
    if (txErr) return { ok: false, error: `Venda: ${txErr.message}` }

    revalidatePath('/gerente/vendas')
    return { ok: true, vendaId }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao finalizar venda'
    return { ok: false, error: msg }
  }
}
