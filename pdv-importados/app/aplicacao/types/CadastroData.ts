/**
 * CadastroData: Dados de Cadastro de Produto
 *
 * Separação de concerns:
 * - Pricing: PolicyInput (preco_varejo, preco_atacado, ...)
 * - Cadastro: CadastroData (nome, categoria, fornecedor, ...)
 * - Contexto: ContextoApp (source, lojaId, userId)
 *
 * O domínio (PricingPolicyService) NUNCA vê CadastroData.
 * Aplicação monta comando com os 3 concerns separados.
 */

export interface CadastroData {
  /** Identificação do produto */
  nome: string
  codigo_barras: string

  /** Custos */
  preco_custo?: number

  /** Classificação */
  categoria_id?: string
  marca_id?: string
  fornecedor_id?: string

  /** Especificações */
  unidade_medida?: string
  ncm?: string

  /** Observações */
  observacao?: string

  /** Status */
  ativo?: boolean
  status_publicacao?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'

  /** Metadados legados (não usados por pricing) */
  origem?: string
  tem_nf?: boolean
}
