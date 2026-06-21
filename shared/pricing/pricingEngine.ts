/**
 * PricingEngine — fronteira arquitetural única para decisões de preço.
 *
 * CONTRATO DE FRONTEIRA
 * ─────────────────────
 * Toda decisão de preço (tipo, valor unitário, desconto por item) deve passar por
 * este módulo. Não instancie PricingService diretamente em outros módulos.
 * Não calcule preços via aritmética inline fora daqui — use as funções exportadas.
 *
 * Superfícies paralelas autorizadas
 * ───────────────────────────────────
 * Frontend  → calcularPrecoItem / calcularCarrinho (usa regras_preco + regras engine)
 * Backend   → RPC calcular_preco_produto (usa precos_atacado) — mesma decisão, camada de BD
 *
 * O backend é autoridade em VAREJO/ATACADO na finalização (recalcularItensNoServidor).
 * O engine frontend é autoridade em PROMOCAO e feedback em tempo real no PDV.
 * O módulo managerDiscount/policy é autoridade em descontos de gerente (teto/clamp).
 *
 * Qualquer nova superfície de cálculo de preço exige aprovação arquitetural explícita
 * e deve ser registrada aqui como exceção documentada.
 */

import { pricingService } from './PricingService'
import type { RegraPreco, ResultadoPreco, PricingContext } from './types'
import type { ItemCarrinho } from '../../shared-core/src/stores/unifiedCartStore'

export type { RegraPreco, ResultadoPreco, PricingContext }
export { DEFAULT_PRICING_CONTEXT } from './types'

/**
 * Calcula o preço de um único item no contexto das regras ativas.
 * Ponto único de entrada para decisões de preço no frontend.
 */
export function calcularPrecoItem(
  item: ItemCarrinho,
  regras: RegraPreco[],
  ctx: PricingContext,
): ResultadoPreco {
  return pricingService.calcularPrecoItem(item, regras, ctx)
}

/**
 * Recalcula preços de todos os itens do carrinho.
 * Chame após mutações de quantidade ou atualização de regras.
 */
export function calcularCarrinho(
  itens: Array<ItemCarrinho & { resultado: ResultadoPreco }>,
  regras: RegraPreco[],
  ctx: PricingContext,
): Array<ItemCarrinho & { resultado: ResultadoPreco }> {
  return pricingService.recalcularCarrinho(itens, regras, ctx)
}
