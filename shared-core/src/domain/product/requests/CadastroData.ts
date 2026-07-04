/**
 * CadastroData — Dados de Cadastro de Produto
 *
 * Request/Input contract for product registration.
 * Contains all fields needed for new product registration.
 *
 * Separation of concerns:
 * - Pricing: PolicyInput (preco_varejo, preco_atacado, ...)
 * - Cadastro: CadastroData (nome, categoria, fornecedor, ...)
 * - Contexto: ContextoApp (source, lojaId, userId)
 *
 * The domain (PricingPolicyService) NEVER sees CadastroData.
 * Application assembles command with all 3 concerns separated.
 */

import type { StatusPublicacao, OrigemProduto, UnidadeMedida } from '../types'

export interface CadastroData {
  /** Identificação do produto */
  nome: string
  codigo_barras?: string

  /** Custos */
  preco_custo?: number

  /** Classificação */
  categoria_id?: string
  marca_id?: string
  fornecedor_id?: string

  /** Especificações */
  unidade_medida?: UnidadeMedida
  ncm?: string

  /** Observações */
  observacao?: string

  /** Status */
  ativo?: boolean
  status_publicacao?: StatusPublicacao

  /** Metadados legados (não usados por pricing) */
  origem?: OrigemProduto
  tem_nf?: boolean
}
