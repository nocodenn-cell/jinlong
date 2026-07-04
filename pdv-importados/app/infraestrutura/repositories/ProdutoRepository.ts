/**
 * ProdutoRepository: Persistência de Produto
 *
 * RESPONSABILIDADE ÚNICA:
 * - Recebe: CreateProductRpcRequest (requisição PRONTA)
 * - Executa: supabase.rpc()
 * - Retorna: RpcExecutionResult
 *
 * ZERO CONHECIMENTO DE:
 * - Pricing, validação, materialização
 * - Serialização JSONB (dados já estão estruturados)
 * - Regras de negócio
 *
 * Se RPC mudar (Fase 2+), apenas esta classe muda.
 */

import { SupabaseClient } from '@supabase/supabase-js'

import type {
  CreateProductRpcRequest,
  RpcExecutionResult,
} from '@shared-core/src/pricing/requests/CreateProductRpcRequest'

export class ProdutoRepository {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Executa requisição RPC pronta.
   *
   * Contrato: RPC assinatura permanece estável (3 parâmetros JSONB).
   * Implementação interna RPC evolui em Fases 2-4, mas signature não muda.
   *
   * @param request - CreateProductRpcRequest com params já estruturados
   * @returns { success: true, id } ou { success: false, error }
   */
  async execute(request: CreateProductRpcRequest): Promise<RpcExecutionResult> {
    // ✅ Apenas executa RPC
    const { data, error } = await this.supabase.rpc(
      request.functionName,
      request.params,
    )

    // ✅ Mapeia resultado
    if (error) {
      return {
        success: false,
        error: error.message || 'Erro ao criar produto',
      }
    }

    if (!data?.id) {
      return {
        success: false,
        error: 'RPC retornou sem ID de produto',
      }
    }

    return {
      success: true,
      id: data.id,
    }
  }
}
