import { createClient } from '@/lib/supabase/server'
import { mapRegraPrecoRow, type RegraPrecoRow } from '@/core/caixa/mapRegrasPreco'
import { pricingService } from '@/shared/pricing/PricingService'
import { DEFAULT_PRICING_CONTEXT, type PricingContext } from '@/shared/pricing/types'
import type { ItemCarrinho } from '@/stores/unifiedCartStore'
import { roundMoney2 } from '@/app/caixa/finalizarVendaValidation'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import { fetchPdvConfigParaCaixaWeb } from '@/app/caixa/server/caixaPdvConfigRpc'

export type ItemAutoritativo = {
  produtoId: string
  quantidade: number
  precoOriginal: number
  precoUnitario: number
  descontoUnitario: number
  tipoPreco: 'VAREJO' | 'ATACADO' | 'MANUAL' | 'PROMOCAO'
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

  const itens: ItemAutoritativo[] = []
  for (const i of itensInput) {
    const p = produtos.get(i.produtoId)!
    const pa = p.preco_atacado
    const itemCarrinho: ItemCarrinho = {
      id: crypto.randomUUID(),
      produtoId: p.id,
      nome: p.nome,
      quantidade: i.quantidade,
      precoUnitario: Number(p.preco_varejo),
      precoOriginal: Number(p.preco_varejo),
      resultado: {
        precoUnitario: Number(p.preco_varejo),
        precoOriginal: Number(p.preco_varejo),
        descontoUnitario: 0,
        tipoPreco: 'VAREJO',
      },
      metaPdv: {
        categoriaId: p.categoria_id,
        precoAtacado: pa === null || pa === undefined ? null : Number(pa),
      },
    }
    const preco = pricingService.calcularPrecoItem(
      itemCarrinho,
      regras,
      pricingCtx
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
