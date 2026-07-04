/**
 * PricingPolicyService: Serviço de Domínio
 *
 * Responsável por transformar a intenção de cadastro simples (capturada pelo usuário)
 * na representação canônica de política comercial (precos_atacado).
 *
 * PRINCÍPIO: O cadastro NÃO sabe que cria tiers. Ele apenas define intenção:
 *   • preco_varejo
 *   • preco_atacado
 *   • quantidade_minima
 *
 * Este serviço materializa essa intenção em precos_atacado, tornando-a transparente.
 *
 * INVARIANTE: Uma única representação canônica (precos_atacado) para todas as políticas.
 * O Price Engine (RPC) nunca consulta quantidade_gatilho_atacado ou pdv_config.
 */

import type { NovoProdutoInput } from '@/core/ports/produto'

/**
 * Representa uma política comercial materializada como tier em precos_atacado.
 */
export interface PrecosAtacadoTier {
  produto_id: string
  loja_id: string | null
  quantidade_minima: number
  preco_unitario: number
  ativo: boolean
  permitir_abaixo_custo: boolean
}

/**
 * Resultado da materialização de política simples.
 */
export interface MaterializePolicySimplesResult {
  success: true
  tier: PrecosAtacadoTier
}

export interface MaterializePolicyError {
  success: false
  error: string
}

export type MaterializePolicyResult = MaterializePolicySimplesResult | MaterializePolicyError

/**
 * Validação de política comercial.
 */
export interface PolicyValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * PricingPolicyService: Orquestra a transformação de intenção em representação canônica.
 */
export class PricingPolicyService {
  /**
   * Valida uma política comercial simples ANTES de materializar.
   *
   * Regras:
   *   • preco_varejo: obrigatório, > 0
   *   • preco_atacado: opcional, se fornecido deve ser < preco_varejo
   *   • quantidade_minima: opcional, se fornecido deve ser >= 1
   */
  validateSimplePolicy(input: NovoProdutoInput): PolicyValidationResult {
    const errors: string[] = []

    // Validação de preco_varejo
    if (!input.preco_varejo || input.preco_varejo <= 0) {
      errors.push('Preço de varejo é obrigatório e deve ser maior que zero.')
    }

    // Validação de preco_atacado vs preco_varejo
    if (input.preco_atacado !== null && input.preco_atacado !== undefined) {
      if (input.preco_atacado <= 0) {
        errors.push('Preço de atacado, se fornecido, deve ser maior que zero.')
      }
      if (input.preco_atacado >= input.preco_varejo) {
        errors.push('Preço de atacado deve ser menor que preço de varejo.')
      }
    }

    // Validação de quantidade_minima
    if (input.quantidade_gatilho_atacado !== null && input.quantidade_gatilho_atacado !== undefined) {
      if (input.quantidade_gatilho_atacado < 1) {
        errors.push('Quantidade mínima para atacado deve ser >= 1.')
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  /**
   * Materializa uma política simples de atacado.
   *
   * Transforma a intenção capturada no cadastro em um tier em precos_atacado.
   *
   * IMPORTANTE: O cadastro não sabe que está criando um tier.
   * A transformação é completamente invisível para ele.
   *
   * @param input - Intenção do cadastro (NovoProdutoInput)
   * @param produtoId - ID do produto recém-criado
   * @param defaultMinimumQuantity - Fallback se usuario não especificar (padrão: 6)
   * @param lojaId - Loja contexto (NULL = global)
   * @returns Tier materializado ou erro
   */
  materializeSimplePolicy(
    input: NovoProdutoInput,
    produtoId: string,
    defaultMinimumQuantity: number = 6,
    lojaId: string | null = null,
  ): MaterializePolicyResult {
    // Se não há preco_atacado, não há política a materializar
    if (input.preco_atacado === null || input.preco_atacado === undefined) {
      return {
        success: true,
        tier: {
          produto_id: produtoId,
          loja_id: lojaId,
          quantidade_minima: 0,
          preco_unitario: 0,
          ativo: false,
          permitir_abaixo_custo: false,
        },
      }
    }

    // Validação
    const validation = this.validateSimplePolicy(input)
    if (!validation.valid) {
      return {
        success: false,
        error: `Política comercial inválida: ${validation.errors.join('; ')}`,
      }
    }

    // Determina quantidade mínima
    const quantidadeMinima = input.quantidade_gatilho_atacado ?? defaultMinimumQuantity

    // Materializa como tier
    const tier: PrecosAtacadoTier = {
      produto_id: produtoId,
      loja_id: lojaId,
      quantidade_minima: quantidadeMinima,
      preco_unitario: input.preco_atacado,
      ativo: true,
      permitir_abaixo_custo: input.permitir_abaixo_custo ?? false,
    }

    return {
      success: true,
      tier,
    }
  }
}

/**
 * Factory para criar instância singleton de PricingPolicyService.
 */
export function createPricingPolicyService(): PricingPolicyService {
  return new PricingPolicyService()
}
