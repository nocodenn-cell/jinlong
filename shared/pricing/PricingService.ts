/**
 * Serviço de precificação.
 *
 * Preço AUTOMÁTICO (varejo/atacado) NÃO é decidido aqui —
 * use `calcularPrecoCanonico` / PRICE_RESOLUTION_CHAIN.
 * Este serviço permanece apenas para overrides PROMOCAO manuais.
 */

import type { ItemCarrinho } from '../../shared-core/src/stores/unifiedCartStore'
import type { RegraPreco, ResultadoPreco, PricingContext } from './types'

export class PricingService {
  private resolverPrecoOriginal(item: ItemCarrinho): number {
    return item.precoOriginal ?? item.precoVariejo ?? item.precoUnitario ?? 0
  }

  private resolverPrecoUnitario(item: ItemCarrinho): number {
    return item.precoUnitario ?? item.precoOriginal ?? item.precoVariejo ?? 0
  }

  recalcularCarrinho(
    itens: Array<ItemCarrinho & { resultado: ResultadoPreco }>,
    regras: RegraPreco[],
    ctx: PricingContext
  ): Array<ItemCarrinho & { resultado: ResultadoPreco }> {
    return itens.map(item => ({
      ...item,
      resultado: this.calcularPrecoItem(item, regras, ctx)
    }))
  }

  /**
   * Aplica apenas PROMOCAO (override). ATACADO automático → calcularPrecoCanonico.
   */
  calcularPrecoItem(
    item: ItemCarrinho,
    regras: RegraPreco[],
    ctx: PricingContext
  ): ResultadoPreco {
    const precoOriginalBase = this.resolverPrecoOriginal(item)
    const precoUnitarioBase = this.resolverPrecoUnitario(item)
    const promocao = this.encontrarPromocao(item, regras, ctx)

    if (!promocao) {
      return {
        precoUnitario: precoUnitarioBase,
        precoOriginal: precoOriginalBase,
        descontoUnitario: 0,
        tipoPreco: 'VAREJO'
      }
    }

    const precoOriginal = precoOriginalBase
    let precoUnitario = precoOriginal

    if (promocao.precoFixo != null) {
      precoUnitario = promocao.precoFixo
    } else if (promocao.descontoPercentual) {
      precoUnitario = precoOriginal - (precoOriginal * promocao.descontoPercentual) / 100
    }

    precoUnitario = Math.min(precoOriginal, Math.max(0, precoUnitario))
    const descontoUnitario = precoOriginal - precoUnitario

    return {
      precoUnitario: Math.round(precoUnitario * 100) / 100,
      precoOriginal,
      descontoUnitario: Math.round(descontoUnitario * 100) / 100,
      tipoPreco: 'PROMOCAO'
    }
  }

  private encontrarPromocao(
    item: ItemCarrinho,
    regras: RegraPreco[],
    ctx: PricingContext
  ): RegraPreco | null {
    return regras.find(
      (r) =>
        r.ativo &&
        r.tipo === 'PROMOCAO' &&
        this.verificarCondicoesRegra(item, r, ctx),
    ) ?? null
  }

  private verificarCondicoesRegra(
    item: ItemCarrinho,
    regra: RegraPreco,
    ctx: PricingContext
  ): boolean {
    if (regra.dataValidade) {
      const validade = new Date(regra.dataValidade)
      const referencia = ctx.dataReferencia ?? new Date()
      if (!Number.isNaN(validade.getTime()) && validade.getTime() < referencia.getTime()) {
        return false
      }
    }

    if (regra.minQuantidade && item.quantidade < regra.minQuantidade) {
      return false
    }
    if (regra.maxQuantidade && item.quantidade > regra.maxQuantidade) {
      return false
    }

    if (regra.produtoId && regra.produtoId !== item.produtoId) {
      return false
    }
    if (regra.categoriaId) {
      const catItem = (item as { categoriaId?: string }).categoriaId
      if (!catItem || regra.categoriaId !== catItem) return false
    }

    return true
  }
}

export const pricingService = new PricingService()
