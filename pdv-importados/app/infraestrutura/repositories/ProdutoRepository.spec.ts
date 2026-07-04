import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ProdutoRepository } from './ProdutoRepository'
import type { CreateProductRpcRequest } from '@shared-core/src/pricing/requests/CreateProductRpcRequest'
import type { SupabaseClient } from '@supabase/supabase-js'

describe('ProdutoRepository', () => {
  let repository: ProdutoRepository
  let mockSupabase: Partial<SupabaseClient>

  beforeEach(() => {
    mockSupabase = {
      rpc: vi.fn(),
    }
    repository = new ProdutoRepository(mockSupabase as SupabaseClient)
  })

  describe('execute', () => {
    it('should call RPC with correct function name and params', async () => {
      const request: CreateProductRpcRequest = {
        functionName: 'criar_produto_com_tier_atomico',
        params: {
          p_product_data: { nome: 'Test', preco_varejo: 100 },
          p_tier_data: { quantidade_minima: 6, preco_unitario: 80, ativo: true, permitir_abaixo_custo: false },
          p_loja_id: 'loja-1',
        },
      }

      ;(mockSupabase.rpc as any).mockResolvedValueOnce({
        data: { id: 'prod-123', success: true },
        error: null,
      })

      const result = await repository.execute(request)

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'criar_produto_com_tier_atomico',
        request.params
      )
      expect(result.success).toBe(true)
      expect((result as any).id).toBe('prod-123')
    })

    it('should return error if RPC fails', async () => {
      const request: CreateProductRpcRequest = {
        functionName: 'criar_produto_com_tier_atomico',
        params: {
          p_product_data: { nome: 'Test', preco_varejo: 100 },
          p_tier_data: { quantidade_minima: 6, preco_unitario: 80, ativo: true, permitir_abaixo_custo: false },
          p_loja_id: null,
        },
      }

      ;(mockSupabase.rpc as any).mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      })

      const result = await repository.execute(request)

      expect(result.success).toBe(false)
      expect((result as any).error).toBe('Database error')
    })

    it('should return error if response has no ID', async () => {
      const request: CreateProductRpcRequest = {
        functionName: 'criar_produto_com_tier_atomico',
        params: {
          p_product_data: { nome: 'Test', preco_varejo: 100 },
          p_tier_data: { quantidade_minima: 6, preco_unitario: 80, ativo: true, permitir_abaixo_custo: false },
          p_loja_id: null,
        },
      }

      ;(mockSupabase.rpc as any).mockResolvedValueOnce({
        data: { success: true }, // Missing 'id'
        error: null,
      })

      const result = await repository.execute(request)

      expect(result.success).toBe(false)
      expect((result as any).error).toContain('sem ID')
    })

    it('INVARIANT: Repository only executes, does not transform or validate', async () => {
      const request: CreateProductRpcRequest = {
        functionName: 'criar_produto_com_tier_atomico',
        params: {
          p_product_data: {
            nome: 'Original Name',
            preco_varejo: 100,
            custom_field: 'should be passed as-is',
          },
          p_tier_data: { quantidade_minima: 6, preco_unitario: 80, ativo: true, permitir_abaixo_custo: false },
          p_loja_id: 'loja-1',
        },
      }

      ;(mockSupabase.rpc as any).mockResolvedValueOnce({
        data: { id: 'prod-123', success: true },
        error: null,
      })

      await repository.execute(request)

      // Verify: params passed unchanged to RPC
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'criar_produto_com_tier_atomico',
        request.params
      )

      const passedParams = (mockSupabase.rpc as any).mock.calls[0][1]
      expect(passedParams.p_product_data.custom_field).toBe('should be passed as-is')
    })
  })
})
