/**
 * Integration Tests: PolicyInput → Domínio → Aplicação → RPC
 *
 * Validates the complete pipeline without reinterpretation:
 * Each layer consumes the output of the previous layer as-is.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ProdutoApplicationService } from './ProdutoApplicationService'
import { PricingPolicyService } from '@shared-core/src/pricing/pricingPolicyService'
import type { PolicyInput } from '@shared-core/src/pricing/policyInput'
import type { CadastroData } from './types/CadastroData'
import type { ContextoApp } from './types/ContextoApp'
import type { ProdutoRepository } from '../infraestrutura/repositories/ProdutoRepository'
import type { CreateProductRpcRequest } from '@shared-core/src/pricing/requests/CreateProductRpcRequest'

describe('ProdutoIntegration: INVARIANT: No Reinterpretation', () => {
  let appService: ProdutoApplicationService
  let pricingService: PricingPolicyService
  let mockRepository: Partial<ProdutoRepository>
  let rpcRequestCaptured: CreateProductRpcRequest | null = null

  beforeEach(() => {
    pricingService = new PricingPolicyService()
    mockRepository = {
      execute: vi.fn(async (request: CreateProductRpcRequest) => {
        rpcRequestCaptured = request
        return {
          success: true as const,
          id: 'prod-uuid',
        }
      }),
    }
    appService = new ProdutoApplicationService(
      pricingService,
      mockRepository as ProdutoRepository
    )
    rpcRequestCaptured = null
  })

  it('INVARIANT: quantidade_minima flows unchanged from PolicyInput → Decision → RPC', async () => {
    const policyInput: PolicyInput = {
      preco_varejo: 100,
      preco_atacado: 80,
      quantidade_gatilho_atacado: 15, // Explicit custom value
      permitir_abaixo_custo: false,
    }

    const cadastro: CadastroData = { nome: 'Test', codigo_barras: '123' }
    const context: ContextoApp = { lojaId: null, source: 'ui' }

    // EXECUTE
    await appService.criarProdutoComTier(policyInput, cadastro, context)

    // VERIFY: quantidade_minima is not reinterpreted
    expect(rpcRequestCaptured).not.toBeNull()
    expect(rpcRequestCaptured!.params.p_tier_data.quantidade_minima).toBe(15)

    // NOT 6 (default), NOT transformed, exactly as input
  })

  it('INVARIANT: default quantity (6) used if input missing, passed unchanged to RPC', async () => {
    const policyInput: PolicyInput = {
      preco_varejo: 100,
      preco_atacado: 80,
      quantidade_gatilho_atacado: null, // Missing → defaults to 6
      permitir_abaixo_custo: false,
    }

    const cadastro: CadastroData = { nome: 'Test', codigo_barras: '123' }
    const context: ContextoApp = { lojaId: null, source: 'ui' }

    // EXECUTE
    await appService.criarProdutoComTier(policyInput, cadastro, context)

    // VERIFY: default 6 used, then passed unchanged
    expect(rpcRequestCaptured).not.toBeNull()
    expect(rpcRequestCaptured!.params.p_tier_data.quantidade_minima).toBe(6)
  })

  it('INVARIANT: permitir_abaixo_custo flows unchanged', async () => {
    const policyInput: PolicyInput = {
      preco_varejo: 100,
      preco_atacado: 80,
      permitir_abaixo_custo: true, // Explicit value
    }

    const cadastro: CadastroData = { nome: 'Test', codigo_barras: '123' }
    const context: ContextoApp = { lojaId: null, source: 'ui' }

    // EXECUTE
    await appService.criarProdutoComTier(policyInput, cadastro, context)

    // VERIFY: not reinterpreted
    expect(rpcRequestCaptured!.params.p_tier_data.permitir_abaixo_custo).toBe(true)
  })

  it('INVARIANT: preco_varejo flows from PolicyInput → tier.preco_unitario', async () => {
    const policyInput: PolicyInput = {
      preco_varejo: 99.99,
      preco_atacado: 77.77,
    }

    const cadastro: CadastroData = { nome: 'Test', codigo_barras: '123' }
    const context: ContextoApp = { lojaId: null, source: 'ui' }

    // EXECUTE
    await appService.criarProdutoComTier(policyInput, cadastro, context)

    // VERIFY: preco_atacado → tier.preco_unitario
    expect(rpcRequestCaptured!.params.p_tier_data.preco_unitario).toBe(77.77)

    // AND: preco_varejo is also in product data
    expect(rpcRequestCaptured!.params.p_product_data.preco_varejo).toBe(99.99)
  })

  it('INVARIANT: cadastro data flows unchanged into RPC', async () => {
    const policyInput: PolicyInput = {
      preco_varejo: 100,
      preco_atacado: 80,
    }

    const cadastro: CadastroData = {
      nome: 'Produto Custom',
      codigo_barras: 'EAN123456789',
      preco_custo: 50,
      categoria_id: 'cat-abc-def',
      origem: 'china_manual',
      tem_nf: true,
    }

    const context: ContextoApp = { lojaId: 'loja-sp', source: 'csv' }

    // EXECUTE
    await appService.criarProdutoComTier(policyInput, cadastro, context)

    // VERIFY: cadastro values not reinterpreted
    expect(rpcRequestCaptured!.params.p_product_data.nome).toBe('Produto Custom')
    expect(rpcRequestCaptured!.params.p_product_data.codigo_barras).toBe('EAN123456789')
    expect(rpcRequestCaptured!.params.p_product_data.preco_custo).toBe(50)
    expect(rpcRequestCaptured!.params.p_product_data.categoria_id).toBe('cat-abc-def')
    expect(rpcRequestCaptured!.params.p_product_data.origem).toBe('china_manual')
    expect(rpcRequestCaptured!.params.p_product_data.tem_nf).toBe(true)

    // AND: context.lojaId flows to RPC
    expect(rpcRequestCaptured!.params.p_loja_id).toBe('loja-sp')
  })

  it('INVARIANT: tier.ativo always true if preco_atacado provided', async () => {
    const policyInput: PolicyInput = {
      preco_varejo: 100,
      preco_atacado: 80, // Provided → tier active
    }

    const cadastro: CadastroData = { nome: 'Test', codigo_barras: '123' }
    const context: ContextoApp = { lojaId: null, source: 'ui' }

    // EXECUTE
    await appService.criarProdutoComTier(policyInput, cadastro, context)

    // VERIFY: tier.ativo is always true
    expect(rpcRequestCaptured!.params.p_tier_data.ativo).toBe(true)
  })

  it('INVARIANT: Multiple origins (UI, CSV, API) produce same RPC signature', async () => {
    const policyInput: PolicyInput = { preco_varejo: 100, preco_atacado: 80 }
    const cadastro: CadastroData = { nome: 'Test', codigo_barras: '123' }

    const origins: Array<'ui' | 'csv' | 'api' | 'seed'> = ['ui', 'csv', 'api', 'seed']

    for (const source of origins) {
      const context: ContextoApp = { lojaId: null, source }

      // Reset capture
      rpcRequestCaptured = null

      // EXECUTE
      await appService.criarProdutoComTier(policyInput, cadastro, context)

      // VERIFY: Same RPC structure, origin recorded in p_product_data.origem
      expect(rpcRequestCaptured).not.toBeNull()
      expect(rpcRequestCaptured!.functionName).toBe('criar_produto_com_tier_atomico')
      expect(rpcRequestCaptured!.params.p_tier_data.quantidade_minima).toBe(6)
    }
  })
})
