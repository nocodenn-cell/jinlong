import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ProdutoApplicationService } from './ProdutoApplicationService'
import { PricingPolicyService } from '@shared-core/src/pricing/pricingPolicyService'
import type { PolicyInput } from '@shared-core/src/pricing/policyInput'
import type { CadastroData } from './types/CadastroData'
import type { ContextoApp } from './types/ContextoApp'
import type { ProdutoRepository } from '../infraestrutura/repositories/ProdutoRepository'
import type { CreateProductRpcRequest } from '@shared-core/src/pricing/requests/CreateProductRpcRequest'

describe('ProdutoApplicationService', () => {
  let appService: ProdutoApplicationService
  let pricingService: PricingPolicyService
  let mockRepository: Partial<ProdutoRepository>

  beforeEach(() => {
    pricingService = new PricingPolicyService()
    mockRepository = {
      execute: vi.fn(async () => ({
        success: true as const,
        id: 'prod-123',
      })),
    }
    appService = new ProdutoApplicationService(
      pricingService,
      mockRepository as ProdutoRepository
    )
  })

  describe('criarProdutoComTier', () => {
    it('should reject if pricing decision fails validation', async () => {
      const policyInput: PolicyInput = {
        preco_varejo: 10,
        preco_atacado: 15, // Invalid: >= varejo
      }

      const cadastro: CadastroData = {
        nome: 'Test',
        codigo_barras: '123',
      }

      const context: ContextoApp = {
        lojaId: null,
        source: 'ui',
      }

      const result = await appService.criarProdutoComTier(
        policyInput,
        cadastro,
        context
      )

      expect(result.success).toBe(false)
      expect((result as any).error).toContain('Preço de atacado deve ser menor')
    })

    it('should reject if tier is null', async () => {
      const policyInput: PolicyInput = {
        preco_varejo: 10,
        preco_atacado: null, // No atacado
      }

      const cadastro: CadastroData = {
        nome: 'Test',
        codigo_barras: '123',
      }

      const context: ContextoApp = {
        lojaId: null,
        source: 'ui',
      }

      const result = await appService.criarProdutoComTier(
        policyInput,
        cadastro,
        context
      )

      expect(result.success).toBe(false)
      expect((result as any).error).toContain('Política de preço obrigatória')
    })

    it('should call repository with correct RPC request', async () => {
      const policyInput: PolicyInput = {
        preco_varejo: 100,
        preco_atacado: 80,
        quantidade_gatilho_atacado: 6,
        permitir_abaixo_custo: false,
      }

      const cadastro: CadastroData = {
        nome: 'Product Test',
        codigo_barras: '123456',
        preco_custo: 50,
        categoria_id: 'cat-1',
        ativo: true,
        status_publicacao: 'PUBLICADO',
        origem: 'manual',
        tem_nf: true,
      }

      const context: ContextoApp = {
        lojaId: 'loja-1',
        source: 'ui',
        userId: 'user-1',
      }

      const result = await appService.criarProdutoComTier(
        policyInput,
        cadastro,
        context
      )

      expect(result.success).toBe(true)
      expect(mockRepository.execute).toHaveBeenCalledOnce()

      const call = (mockRepository.execute as any).mock.calls[0][0] as CreateProductRpcRequest

      // Verify RPC request structure
      expect(call.functionName).toBe('criar_produto_com_tier_atomico')
      expect(call.params.p_product_data.nome).toBe('Product Test')
      expect(call.params.p_product_data.preco_varejo).toBe(100)
      expect(call.params.p_product_data.preco_custo).toBe(50)
      expect(call.params.p_product_data.categoria_id).toBe('cat-1')
      expect(call.params.p_product_data.origem).toBe('manual')
      expect(call.params.p_product_data.tem_nf).toBe(true)

      // Verify tier data
      expect(call.params.p_tier_data.quantidade_minima).toBe(6)
      expect(call.params.p_tier_data.preco_unitario).toBe(80)
      expect(call.params.p_tier_data.ativo).toBe(true)
      expect(call.params.p_tier_data.permitir_abaixo_custo).toBe(false)

      // Verify loja context
      expect(call.params.p_loja_id).toBe('loja-1')
    })

    it('INVARIANT: Decision is not reinterpreted (passed as-is to RPC)', async () => {
      const policyInput: PolicyInput = {
        preco_varejo: 100,
        preco_atacado: 80,
        quantidade_gatilho_atacado: 12, // Custom quantity
      }

      const cadastro: CadastroData = {
        nome: 'Test',
        codigo_barras: '123',
      }

      const context: ContextoApp = {
        lojaId: null,
        source: 'csv',
      }

      const result = await appService.criarProdutoComTier(
        policyInput,
        cadastro,
        context
      )

      expect(result.success).toBe(true)

      const call = (mockRepository.execute as any).mock.calls[0][0] as CreateProductRpcRequest

      // Verify: quantidade_minima from decision passed unchanged to RPC
      expect(call.params.p_tier_data.quantidade_minima).toBe(12)
    })

    it('should return repository error if RPC fails', async () => {
      mockRepository.execute = vi.fn(async () => ({
        success: false,
        error: 'RPC execution failed',
      }))

      const policyInput: PolicyInput = {
        preco_varejo: 100,
        preco_atacado: 80,
      }

      const cadastro: CadastroData = {
        nome: 'Test',
        codigo_barras: '123',
      }

      const context: ContextoApp = {
        lojaId: null,
        source: 'ui',
      }

      const result = await appService.criarProdutoComTier(
        policyInput,
        cadastro,
        context
      )

      expect(result.success).toBe(false)
      expect((result as any).error).toBe('RPC execution failed')
    })
  })
})
