/**
 * Motor de preço atacado — Strategy Pattern.
 * Sem dependência de React, Next ou Supabase (copiável para PDV local / Tauri).
 */
import type { ItemCarrinho } from '../cart/types'
import type { PricingContext, RegraPreco, ResultadoPreco } from './types'
import { DEFAULT_PRICING_CONTEXT } from './types'

interface PriceStrategy {
  calcular(
    item: ItemCarrinho,
    regras: RegraPreco[],
    quantidadeTotal: number,
    ctx: PricingContext,
  ): ResultadoPreco | null
}

/** Atacado explícito no cadastro do produto (acima da quantidade mínima configurada). */
class PrecoAtacadoCatalogoStrategy implements PriceStrategy {
  calcular(
    item: ItemCarrinho,
    _regras: RegraPreco[],
    quantidadeTotal: number,
    ctx: PricingContext,
  ): ResultadoPreco | null {
    const pa =
      item.precoAtacado !== undefined && item.precoAtacado !== null
        ? Number(item.precoAtacado)
        : null
    if (pa === null || Number.isNaN(pa) || pa < 0) return null
    if (quantidadeTotal < ctx.quantidadeMinimaAtacadoPadrao) return null
    const pv = item.precoVariejo
    return {
      precoUnitario: Math.round(pa * 100) / 100,
      precoOriginal: pv,
      descontoUnitario: Math.round((pv - pa) * 100) / 100,
      tipoPreco: 'ATACADO',
    }
  }
}

class ProductWholesaleStrategy implements PriceStrategy {
  calcular(
    item: ItemCarrinho,
    regras: RegraPreco[],
    quantidadeTotal: number,
    _ctx: PricingContext,
  ): ResultadoPreco | null {
    const regrasDoP = regras
      .filter(
        (r) =>
          r.tipoRegra === 'PRODUTO' &&
          r.produtoId === item.produtoId &&
          r.ativo &&
          !isExpirada(r)
      )
      .sort((a, b) => b.quantidadeMinima - a.quantidadeMinima)

    const regra = regrasDoP.find(
      (r) =>
        quantidadeTotal >= r.quantidadeMinima &&
        (r.quantidadeMaxima === undefined || quantidadeTotal <= r.quantidadeMaxima)
    )

    if (!regra) return null
    return aplicarDesconto(item.precoVariejo, regra)
  }
}

class CategoryWholesaleStrategy implements PriceStrategy {
  calcular(
    item: ItemCarrinho,
    regras: RegraPreco[],
    quantidadeTotal: number,
    _ctx: PricingContext,
  ): ResultadoPreco | null {
    if (!item.categoriaId) return null

    const regrasCat = regras
      .filter(
        (r) =>
          r.tipoRegra === 'CATEGORIA' &&
          r.categoriaId === item.categoriaId &&
          r.ativo &&
          !isExpirada(r)
      )
      .sort((a, b) => b.quantidadeMinima - a.quantidadeMinima)

    const regra = regrasCat.find(
      (r) =>
        quantidadeTotal >= r.quantidadeMinima &&
        (r.quantidadeMaxima === undefined || quantidadeTotal <= r.quantidadeMaxima)
    )

    if (!regra) return null
    return aplicarDesconto(item.precoVariejo, regra)
  }
}

class DefaultPriceStrategy implements PriceStrategy {
  calcular(item: ItemCarrinho, _r: RegraPreco[], _q: number, _ctx: PricingContext): ResultadoPreco {
    return {
      precoUnitario: item.precoVariejo,
      precoOriginal: item.precoVariejo,
      descontoUnitario: 0,
      tipoPreco: 'VAREJO',
    }
  }
}

export class PricingService {
  private strategies: PriceStrategy[]

  constructor() {
    this.strategies = [
      new PrecoAtacadoCatalogoStrategy(),
      new ProductWholesaleStrategy(),
      new CategoryWholesaleStrategy(),
      new DefaultPriceStrategy(),
    ]
  }

  calcularPreco(
    item: ItemCarrinho,
    regras: RegraPreco[],
    quantidadeTotal: number,
    ctx: PricingContext = DEFAULT_PRICING_CONTEXT,
  ): ResultadoPreco {
    for (const strategy of this.strategies) {
      const resultado = strategy.calcular(item, regras, quantidadeTotal, ctx)
      if (resultado !== null) return resultado
    }
    return {
      precoUnitario: item.precoVariejo,
      precoOriginal: item.precoVariejo,
      descontoUnitario: 0,
      tipoPreco: 'VAREJO',
    }
  }

  recalcularCarrinho(
    carrinho: ItemCarrinho[],
    regras: RegraPreco[],
    ctx: PricingContext = DEFAULT_PRICING_CONTEXT,
  ): Array<ItemCarrinho & { resultado: ResultadoPreco }> {
    const quantidadesPorProduto = carrinho.reduce<Record<string, number>>(
      (acc, item) => {
        acc[item.produtoId] = (acc[item.produtoId] ?? 0) + item.quantidade
        return acc
      },
      {}
    )

    return carrinho.map((item) => ({
      ...item,
      resultado: this.calcularPreco(
        item,
        regras,
        quantidadesPorProduto[item.produtoId] ?? item.quantidade,
        ctx,
      ),
    }))
  }
}

function aplicarDesconto(precoBase: number, regra: RegraPreco): ResultadoPreco {
  let precoFinal: number
  if (regra.tipoDesconto === 'PERCENTUAL') {
    precoFinal = precoBase * (1 - regra.valorDesconto / 100)
  } else {
    precoFinal = Math.max(0, precoBase - regra.valorDesconto)
  }
  precoFinal = Math.round(precoFinal * 100) / 100
  return {
    precoUnitario: precoFinal,
    precoOriginal: precoBase,
    descontoUnitario: Math.round((precoBase - precoFinal) * 100) / 100,
    tipoPreco: 'ATACADO',
    regraAplicadaId: regra.id,
  }
}

function isExpirada(regra: RegraPreco): boolean {
  if (!regra.dataValidade) return false
  return new Date(regra.dataValidade) < new Date()
}

export const pricingService = new PricingService()
