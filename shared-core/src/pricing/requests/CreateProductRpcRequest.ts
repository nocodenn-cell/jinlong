/**
 * CreateProductRpcRequest: Requisição RPC PRONTA para Execução
 *
 * RESPONSABILIDADE DA APLICAÇÃO: Construir esta requisição.
 * RESPONSABILIDADE DO REPOSITORY: Apenas executá-la (sem transformações).
 *
 * Contrato: RPC signature permanece estável em Fases 1-4.
 * Implementação interna da RPC evolui, mas parâmetros (3 JSONB) nunca mudam.
 */

/**
 * Requisição RPC para criar produto com tier atomicamente.
 *
 * Parâmetros:
 * - p_product_data: JSONB com todos os campos do produto
 * - p_tier_data: JSONB com todos os campos do tier
 * - p_loja_id: UUID da loja (ou null para global)
 */
export interface CreateProductRpcRequest {
  functionName: 'criar_produto_com_tier_atomico'

  params: {
    /** Dados do produto (nome, codigo_barras, preco_varejo, ...) */
    p_product_data: Record<string, unknown>

    /** Dados do tier (quantidade_minima, preco_unitario, ...) */
    p_tier_data: Record<string, unknown>

    /** Contexto: qual loja? (null = global) */
    p_loja_id: string | null
  }
}

/**
 * Resultado da execução RPC.
 */
export type RpcExecutionResult =
  | {
      success: true
      id: string
    }
  | {
      success: false
      error: string
    }
