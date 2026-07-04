import { describe, it, expect } from 'vitest'
import { PricingPolicyService } from './pricingPolicyService'
import type { NovoProdutoInput } from '@/core/ports/produto'

describe('PricingPolicyService', () => {
  const service = new PricingPolicyService()

  describe('validateSimplePolicy', () => {
    it('should reject if preco_varejo is missing or <= 0', () => {
      const input: NovoProdutoInput = {
        nome: 'Test',
        preco_varejo: 0,
        preco_atacado: null,
        origem: 'china_manual',
        tem_nf: false,
      }

      const result = service.validateSimplePolicy(input)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should reject if preco_atacado >= preco_varejo', () => {
      const input: NovoProdutoInput = {
        nome: 'Test',
        preco_varejo: 10.0,
        preco_atacado: 10.0,
        origem: 'china_manual',
        tem_nf: false,
      }

      const result = service.validateSimplePolicy(input)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('menor'))).toBe(true)
    })

    it('should reject if quantidade_gatilho_atacado < 1', () => {
      const input: NovoProdutoInput = {
        nome: 'Test',
        preco_varejo: 10.0,
        preco_atacado: 8.0,
        quantidade_gatilho_atacado: 0,
        origem: 'china_manual',
        tem_nf: false,
      }

      const result = service.validateSimplePolicy(input)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Quantidade'))).toBe(true)
    })

    it('should accept valid simple policy', () => {
      const input: NovoProdutoInput = {
        nome: 'Product A',
        preco_varejo: 10.0,
        preco_atacado: 8.0,
        quantidade_gatilho_atacado: 6,
        origem: 'china_manual',
        tem_nf: false,
      }

      const result = service.validateSimplePolicy(input)
      expect(result.valid).toBe(true)
      expect(result.errors.length).toBe(0)
    })

    it('should accept policy without atacado price', () => {
      const input: NovoProdutoInput = {
        nome: 'Product B',
        preco_varejo: 10.0,
        preco_atacado: null,
        origem: 'china_manual',
        tem_nf: false,
      }

      const result = service.validateSimplePolicy(input)
      expect(result.valid).toBe(true)
    })
  })

  describe('materializeSimplePolicy', () => {
    it('should not create tier if preco_atacado is null', () => {
      const input: NovoProdutoInput = {
        nome: 'No Atacado',
        preco_varejo: 10.0,
        preco_atacado: null,
        origem: 'china_manual',
        tem_nf: false,
      }

      const result = service.materializeSimplePolicy(input, 'prod-123')
      expect(result.success).toBe(true)
      expect(result.tier.ativo).toBe(false) // Inactive if no atacado price
    })

    it('should create tier with default quantity if not specified', () => {
      const input: NovoProdutoInput = {
        nome: 'Product A',
        preco_varejo: 10.0,
        preco_atacado: 8.0,
        quantidade_gatilho_atacado: null,
        origem: 'china_manual',
        tem_nf: false,
      }

      const result = service.materializeSimplePolicy(input, 'prod-123', 6, null)
      expect(result.success).toBe(true)
      expect(result.tier.quantidade_minima).toBe(6)
      expect(result.tier.preco_unitario).toBe(8.0)
      expect(result.tier.ativo).toBe(true)
    })

    it('should create tier with custom quantity if specified', () => {
      const input: NovoProdutoInput = {
        nome: 'Product B',
        preco_varejo: 100.0,
        preco_atacado: 80.0,
        quantidade_gatilho_atacado: 12,
        origem: 'china_manual',
        tem_nf: false,
      }

      const result = service.materializeSimplePolicy(input, 'prod-456', 6, null)
      expect(result.success).toBe(true)
      expect(result.tier.quantidade_minima).toBe(12)
      expect(result.tier.preco_unitario).toBe(80.0)
    })

    it('should respect permitir_abaixo_custo flag', () => {
      const input: NovoProdutoInput = {
        nome: 'Liquidation',
        preco_varejo: 10.0,
        preco_atacado: 5.0,
        permitir_abaixo_custo: true,
        origem: 'china_manual',
        tem_nf: false,
      }

      const result = service.materializeSimplePolicy(input, 'prod-789')
      expect(result.success).toBe(true)
      expect(result.tier.permitir_abaixo_custo).toBe(true)
    })

    it('should set loja_id correctly', () => {
      const input: NovoProdutoInput = {
        nome: 'Store Specific',
        preco_varejo: 10.0,
        preco_atacado: 8.0,
        origem: 'china_manual',
        tem_nf: false,
      }

      const result = service.materializeSimplePolicy(input, 'prod-101', 6, 'loja-sp')
      expect(result.success).toBe(true)
      expect(result.tier.loja_id).toBe('loja-sp')
    })

    it('should reject invalid policy', () => {
      const input: NovoProdutoInput = {
        nome: 'Invalid',
        preco_varejo: 10.0,
        preco_atacado: 15.0, // Greater than varejo!
        origem: 'china_manual',
        tem_nf: false,
      }

      const result = service.materializeSimplePolicy(input, 'prod-bad')
      expect(result.success).toBe(false)
      expect(result.error).toContain('inválida')
    })
  })

  describe('INVARIANT: Canonical Representation', () => {
    it('should always materialize as precos_atacado tier, never multiple sources', () => {
      const input: NovoProdutoInput = {
        nome: 'Canonical Test',
        preco_varejo: 100.0,
        preco_atacado: 80.0,
        quantidade_gatilho_atacado: 10,
        origem: 'china_manual',
        tem_nf: false,
      }

      const result = service.materializeSimplePolicy(input, 'prod-canon')
      expect(result.success).toBe(true)

      // Exactly one tier representation
      expect(result.tier.produto_id).toBe('prod-canon')
      expect(result.tier.quantidade_minima).toBe(10)
      expect(result.tier.preco_unitario).toBe(80.0)

      // No other representation should exist
      // (quantidade_gatilho_atacado field is ignored; tier is the canonical source)
    })
  })
})
