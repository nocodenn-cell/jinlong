import { createClient } from '@/lib/supabase/server'
import { mapRegraPrecoRow, type RegraPrecoRow } from '@/core/caixa/mapRegrasPreco'
import type { ItemCarrinho } from '@/core/cart/types'
import { pricingService } from '@/core/pricing/PricingService'
import { DEFAULT_PRICING_CONTEXT, type PricingContext } from '@/core/pricing/types'
import { roundMoney2 } from '@/app/caixa/finalizarVendaValidation'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import { fetchPdvConfigParaCaixaWeb } from '@/app/caixa/server/caixaPdvConfigRpc'

export type ItemAutoritativo = {
  produtoId: string
  quantidade: number
  precoOriginal: number
  precoUnitario: number
  descontoUnitario: number
  tipoPreco: 'VAREJO' | 'ATACADO' | 'MANUAL'
}

export async function recalcularItensNoServidor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itensInput: Array<{ produtoId: string; quantidade: number }>,
): Promise<{ ok: true; itens: ItemAutoritativo[] } | { ok: false; error: string }> {
  const produtosIds = Array.from(new Set(itensInput.map((i) => i.produtoId)))
  const { data: produtosRows, error: prodErr } = await supabase
    .from('produtos')
    .select('id, nome, preco_varejo, preco_atacado, categoria_id, ativo')
    .in('id', produtosIds)
    .eq('ativo', true)

  if (prodErr) return { ok: false, error: mensagemErroComSecao('Produtos', prodErr.message) }
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
  if (regrasErr) return { ok: false, error: mensagemErroComSecao('Regras de preço', regrasErr.message) }
  const regras = (regrasRows as RegraPrecoRow[] | null)?.map(mapRegraPrecoRow) ?? []

  const cfgRes = await fetchPdvConfigParaCaixaWeb(supabase)
  const cfg = cfgRes.ok ? cfgRes.row : null
  const pricingCtx: PricingContext = {
    quantidadeMinimaAtacadoPadrao: cfg?.quantidade_minima_atacado_padrao
      ? Number(cfg.quantidade_minima_atacado_padrao)
      : DEFAULT_PRICING_CONTEXT.quantidadeMinimaAtacadoPadrao,
  }

  const quantidadePorProduto = itensInput.reduce<Record<string, number>>((acc, item) => {
    acc[item.produtoId] = (acc[item.produtoId] ?? 0) + item.quantidade
    return acc
  }, {})

  const itens: ItemAutoritativo[] = []
  for (const i of itensInput) {
    const p = produtos.get(i.produtoId)!
    const pa = p.preco_atacado
    const itemCarrinho: ItemCarrinho = {
      id: crypto.randomUUID(),
      produtoId: p.id,
      nome: p.nome,
      quantidade: i.quantidade,
      precoVariejo: Number(p.preco_varejo),
      precoAtacado: pa === null || pa === undefined ? null : Number(pa),
      categoriaId: p.categoria_id ?? undefined,
    }
    const preco = pricingService.calcularPreco(
      itemCarrinho,
      regras,
      quantidadePorProduto[i.produtoId],
      pricingCtx,
    )
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
