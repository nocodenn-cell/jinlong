import { describe, it, expect } from 'vitest'
import { PricingPolicyService } from './pricingPolicyService'
import type { PolicyInput } from './policyInput'
import type { PricingDecision } from './decisions/PricingDecision'

describe('PricingPolicyService', () => {
  const service = new PricingPolicyService()

  describe('validateSimplePolicy', () => {
    it('should reject if preco_varejo is missing or <= 0', () => {
      const input: PolicyInput = {
        preco_varejo: 0,
        preco_atacado: null,
      }

      const result = service.validateSimplePolicy(input)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should reject if preco_atacado >= preco_varejo', () => {
      const input: PolicyInput = {
        preco_varejo: 10.0,
        preco_atacado: 10.0,
      }

      const result = service.validateSimplePolicy(input)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('menor'))).toBe(true)
    })

    it('should reject if quantidade_gatilho_atacado < 1', () => {
      const input: PolicyInput = {
        preco_varejo: 10.0,
        preco_atacado: 8.0,
        quantidade_gatilho_atacado: 0,
      }

      const result = service.validateSimplePolicy(input)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Quantidade'))).toBe(true)
    })

    it('should accept valid simple policy', () => {
      const input: PolicyInput = {
        preco_varejo: 10.0,
        preco_atacado: 8.0,
        quantidade_gatilho_atacado: 6,
      }

      const result = service.validateSimplePolicy(input)
      expect(result.valid).toBe(true)
      expect(result.errors.length).toBe(0)
    })

    it('should accept policy without atacado price', () => {
      const input: PolicyInput = {
        preco_varejo: 10.0,
        preco_atacado: null,
      }

      const result = service.validateSimplePolicy(input)
      expect(result.valid).toBe(true)
    })
  })

  describe('createPricingDecision', () => {
    it('should return tier=null if preco_atacado is null', () => {
      const input: PolicyInput = {
        preco_varejo: 10.0,
        preco_atacado: null,
      }

      const result = service.createPricingDecision(input)
      expect('error' in result).toBe(false)

      const decision = result as PricingDecision
      expect(decision.tier).toBeNull()
    })

    it('should return error if validation fails', () => {
      const input: PolicyInput = {
        preco_varejo: 10.0,
        preco_atacado: 15.0, // Invalid: > varejo
      }

      const result = service.createPricingDecision(input)
      expect('error' in result).toBe(true)
      expect((result as any).error).toContain('Preço de atacado deve ser menor')
    })

    it('should create tier with default quantity if not specified', () => {
      const input: PolicyInput = {
        preco_varejo: 10.0,
        preco_atacado: 8.0,
      }

      const result = service.createPricingDecision(input, 6)
      expect('error' in result).toBe(false)

      const decision = result as PricingDecision
      expect(decision.tier).not.toBeNull()
      expect(decision.tier!.quantidade_minima).toBe(6)
      expect(decision.tier!.preco_unitario).toBe(8.0)
      expect(decision.tier!.ativo).toBe(true)
    })

    it('should create tier with custom quantity if specified', () => {
      const input: PolicyInput = {
        preco_varejo: 100.0,
        preco_atacado: 80.0,
        quantidade_gatilho_atacado: 12,
      }

      const result = service.createPricingDecision(input)
      expect('error' in result).toBe(false)

      const decision = result as PricingDecision
      expect(decision.tier!.quantidade_minima).toBe(12)
      expect(decision.tier!.preco_unitario).toBe(80.0)
    })

    it('should respect permitir_abaixo_custo flag', () => {
      const input: PolicyInput = {
        preco_varejo: 10.0,
        preco_atacado: 5.0,
        permitir_abaixo_custo: true,
      }

      const result = service.createPricingDecision(input)
      expect('error' in result).toBe(false)

      const decision = result as PricingDecision
      expect(decision.tier!.permitir_abaixo_custo).toBe(true)
    })

    it('INVARIANT: decision is pure (no produto data, no context)', () => {
      const input: PolicyInput = {
        preco_varejo: 100.0,
        preco_atacado: 80.0,
        quantidade_gatilho_atacado: 10,
      }

      const result = service.createPricingDecision(input)
      const decision = result as PricingDecision

      // ✅ Decision contains ONLY tier
      expect(Object.keys(decision)).toEqual(['tier'])

      // ✅ No produto data
      expect((decision as any).produto).toBeUndefined()

      // ✅ No context
      expect((decision as any).context).toBeUndefined()
      expect((decision as any).decision_rationale).toBeUndefined()
    })
  })
})
