/**
 * Generic pricing policy input — workspace-agnostic.
 *
 * This is the minimal contract that PricingPolicyService needs.
 * Implementers (pdv-importados, etc.) extend this with their own fields.
 */

export interface PolicyInput {
  preco_varejo: number
  preco_atacado?: number | null
  quantidade_gatilho_atacado?: number | null
  permitir_abaixo_custo?: boolean
}
