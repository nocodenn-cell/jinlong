/**
 * Serviço de precificação unificado
 */

import type { ItemCarrinho } from '../../pdv-importados/stores/unifiedCartStore'
import type { RegraPreco, ResultadoPreco, PricingContext } from './types'

export class PricingService {
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
    
    if (!regraAplicavel) {
      return {
        precoUnitario: item.precoUnitario,
        precoOriginal: item.precoOriginal,
        descontoUnitario: 0,
        tipoPreco: 'VAREJO'
      }
    }

    const precoOriginal = item.precoOriginal
    let precoUnitario = precoOriginal
    let descontoUnitario = 0
    let tipoPreco: ResultadoPreco['tipoPreco'] = 'VAREJO'

    if (regraAplicavel.tipo === 'ATAcado' && item.quantidade >= (regraAplicavel.minQuantidade || 1)) {
      descontoUnitario = (precoOriginal * (regraAplicavel.descontoPercentual || 0)) / 100
      precoUnitario = precoOriginal - descontoUnitario
      tipoPreco = 'ATACADO'
    } else if (regraAplicavel.tipo === 'PROMOCAO') {
      if (regraAplicavel.precoFixo) {
        precoUnitario = regraAplicavel.precoFixo
        descontoUnitario = precoOriginal - precoUnitario
      } else if (regraAplicavel.descontoPercentual) {
        descontoUnitario = (precoOriginal * regraAplicavel.descontoPercentual) / 100
        precoUnitario = precoOriginal - descontoUnitario
      }
      tipoPreco = 'PROMOCAO'
    }

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

    const regraAtacado = regrasAtivas.find(r => 
      r.tipo === 'ATAcado' && 
      item.quantidade >= (r.minQuantidade || 1) &&
      this.verificarCondicoesRegra(item, r, ctx)
    )

    return regraAtacado || null
  }

  /**
   * Verifica se as condições da regra são atendidas
   */
  private verificarCondicoesRegra(
    item: ItemCarrinho,
    regra: RegraPreco,
    ctx: PricingContext
  ): boolean {
    // Verificar limites de quantidade
    if (regra.minQuantidade && item.quantidade < regra.minQuantidade) {
      return false
    }
    if (regra.maxQuantidade && item.quantidade > regra.maxQuantidade) {
      return false
    }

    // Verificar condições de perfil (se aplicável)
    // Aqui poderíamos adicionar lógica mais complexa baseada no contexto

    return true
  }
}

export const pricingService = new PricingService()
