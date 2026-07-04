/**
 * PricingDecision: Resultado da Decisão Comercial de Precificação
 *
 * Representa UMA ÚNICA DECISÃO: Qual é a política de preço para este produto?
 *
 * RESTRIÇÃO ARQUITETURAL:
 * - Contém APENAS decisões comerciais (tier)
 * - ZERO dados de cadastro (nome, categoria, fornecedor)
 * - ZERO contexto (origem, userId, timestamp)
 * - ZERO metadados de explicabilidade (decision_rationale)
 *
 * Se no futuro precisar de auditoria/explicabilidade, criar tipo separado.
 * Domínio entrega decision pura, observabilidade é concern separado.
 */

/**
 * Tier de preço para atacado.
 * Representa a política de desconto por quantidade.
 */
export interface PricingTier {
  /** Quantidade mínima para ativar este preço */
  quantidade_minima: number

  /** Preço unitário quando quantidade >= quantidade_minima */
  preco_unitario: number

  /** Política está ativa? */
  ativo: boolean

  /** Permite venda abaixo do custo? */
  permitir_abaixo_custo: boolean
}

/**
 * Decisão comercial pura: Qual é a política de preço?
 *
 * - tier !== null: Há política de atacado com esses parâmetros
 * - tier === null: Não há política de atacado (apenas varejo)
 */
export interface PricingDecision {
  /**
   * Tier de preço atacado (ou null se não há política).
   *
   * INVARIANTE: Se preco_atacado foi fornecido na entrada, tier !== null.
   *             Se preco_atacado não foi fornecido, tier === null.
   */
  tier: PricingTier | null
}
