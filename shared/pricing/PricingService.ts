/**
 * Serviço de precificação unificado
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

  /**
   * Recalcula preços do carrinho baseado nas regras e contexto
   */
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
   * Calcula preço para um item específico
   */
  calcularPrecoItem(
    item: ItemCarrinho,
    regras: RegraPreco[],
    ctx: PricingContext
  ): ResultadoPreco {
    const regraAplicavel = this.encontrarRegraAplicavel(item, regras, ctx)
    const precoOriginalBase = this.resolverPrecoOriginal(item)
    const precoUnitarioBase = this.resolverPrecoUnitario(item)
    
    if (!regraAplicavel) {
      return {
        precoUnitario: precoUnitarioBase,
        precoOriginal: precoOriginalBase,
        descontoUnitario: 0,
        tipoPreco: 'VAREJO'
      }
    }

    const precoOriginal = precoOriginalBase
    let precoUnitario = precoOriginal
    let tipoPreco: ResultadoPreco['tipoPreco'] = 'VAREJO'

    if (regraAplicavel.tipo === 'ATACADO' && item.quantidade >= (regraAplicavel.minQuantidade || 1)) {
      if (regraAplicavel.precoFixo != null) {
        // Absoluto (faixas precos_atacado projetadas no sync) — paridade com RPC.
        precoUnitario = regraAplicavel.precoFixo
      } else {
        const desconto = (precoOriginal * (regraAplicavel.descontoPercentual || 0)) / 100
        precoUnitario = precoOriginal - desconto
      }
      tipoPreco = 'ATACADO'
    } else if (regraAplicavel.tipo === 'PROMOCAO') {
      if (regraAplicavel.precoFixo != null) {
        precoUnitario = regraAplicavel.precoFixo
      } else if (regraAplicavel.descontoPercentual) {
        precoUnitario = precoOriginal - (precoOriginal * regraAplicavel.descontoPercentual) / 100
      }
      tipoPreco = 'PROMOCAO'
    }

    // Guard de piso: preço unitário nunca negativo e nunca acima do original
    // (ex.: descontoPercentual > 100 ou precoFixo inválido). O desconto é derivado
    // do preço já clampado para manter precoOriginal - descontoUnitario === precoUnitario.
    precoUnitario = Math.min(precoOriginal, Math.max(0, precoUnitario))
    const descontoUnitario = precoOriginal - precoUnitario

    return {
      precoUnitario: Math.round(precoUnitario * 100) / 100,
      precoOriginal,
      descontoUnitario: Math.round(descontoUnitario * 100) / 100,
      tipoPreco
    }
  }

  /**
   * Encontra a regra mais aplicável para o item
   */
  private encontrarRegraAplicavel(
    item: ItemCarrinho,
    regras: RegraPreco[],
    ctx: PricingContext
  ): RegraPreco | null {
    const regrasAtivas = regras.filter(r => r.ativo)

    // Prioridade: PROMOCAO > ATACADO > VAREJO
    const regraPromocao = regrasAtivas.find(r => 
      r.tipo === 'PROMOCAO' && 
      this.verificarCondicoesRegra(item, r, ctx)
    )

    if (regraPromocao) return regraPromocao

    // BA-011: rpc escolher maior quantidade_minima; não depender da ordem do array.
    const atacadoMatches = regrasAtivas.filter(
      (r) =>
        r.tipo === 'ATACADO' &&
        item.quantidade >= (r.minQuantidade || 1) &&
        this.verificarCondicoesRegra(item, r, ctx),
    )
    if (atacadoMatches.length === 0) return null
    return atacadoMatches.reduce((best, r) =>
      (r.minQuantidade || 0) > (best.minQuantidade || 0) ? r : best,
    )
  }

  /**
   * Verifica se as condições da regra são atendidas
   */
  private verificarCondicoesRegra(
    item: ItemCarrinho,
    regra: RegraPreco,
    ctx: PricingContext
  ): boolean {
    // Validade: regra vencida não se aplica (compara com dataReferencia do contexto ou agora).
    if (regra.dataValidade) {
      const validade = new Date(regra.dataValidade)
      const referencia = ctx.dataReferencia ?? new Date()
      if (!Number.isNaN(validade.getTime()) && validade.getTime() < referencia.getTime()) {
        return false
      }
    }

    // Verificar limites de quantidade
    if (regra.minQuantidade && item.quantidade < regra.minQuantidade) {
      return false
    }
    if (regra.maxQuantidade && item.quantidade > regra.maxQuantidade) {
      return false
    }

    // Escopo produto/categoria (evita aplicar faixa de outro SKU).
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
