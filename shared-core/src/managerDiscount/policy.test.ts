import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAX_DESCONTO_GERENTE_PERCENTUAL,
  aplicarDescontoGerenteSobreTotal,
  calcularDescontoGerenteValor,
  clampPercentualDesconto,
  validarPercentualPermitido,
} from './policy'

describe('managerDiscount/policy', () => {
  describe('DEFAULT_MAX_DESCONTO_GERENTE_PERCENTUAL', () => {
    it('alinha com o fallback da Edge Function validar-gerente (20%)', () => {
      expect(DEFAULT_MAX_DESCONTO_GERENTE_PERCENTUAL).toBe(20)
    })
  })

  describe('clampPercentualDesconto', () => {
    it('retorna 0 quando teto for 0 ou negativo', () => {
      expect(clampPercentualDesconto(10, 0)).toBe(0)
      expect(clampPercentualDesconto(10, -5)).toBe(0)
    })

    it('retorna 0 quando percentual for 0 ou negativo', () => {
      expect(clampPercentualDesconto(0, 20)).toBe(0)
      expect(clampPercentualDesconto(-3, 20)).toBe(0)
    })

    it('limita ao teto quando solicitado excede o permitido', () => {
      expect(clampPercentualDesconto(50, 20)).toBe(20)
    })

    it('preserva o percentual quando dentro do teto', () => {
      expect(clampPercentualDesconto(7, 20)).toBe(7)
    })

    it('preserva exato quando percentual = teto', () => {
      expect(clampPercentualDesconto(20, 20)).toBe(20)
    })

    it('trata NaN como 0', () => {
      expect(clampPercentualDesconto(Number.NaN, 20)).toBe(0)
      expect(clampPercentualDesconto(10, Number.NaN)).toBe(0)
    })
  })

  describe('calcularDescontoGerenteValor', () => {
    it('calcula desconto com 2 casas e arredondamento financeiro', () => {
      expect(calcularDescontoGerenteValor(100, 10)).toBe(10)
      expect(calcularDescontoGerenteValor(99.99, 10)).toBe(10)
      expect(calcularDescontoGerenteValor(33.33, 7)).toBe(2.33)
    })

    it('retorna 0 quando total ou percentual forem 0/negativos', () => {
      expect(calcularDescontoGerenteValor(0, 10)).toBe(0)
      expect(calcularDescontoGerenteValor(100, 0)).toBe(0)
      expect(calcularDescontoGerenteValor(-50, 10)).toBe(0)
    })
  })

  describe('validarPercentualPermitido', () => {
    it('aceita percentual exato no teto', () => {
      expect(validarPercentualPermitido(20, 20)).toEqual({ ok: true })
    })

    it('aceita percentual zero', () => {
      expect(validarPercentualPermitido(0, 20)).toEqual({ ok: true })
    })

    it('rejeita percentual negativo', () => {
      expect(validarPercentualPermitido(-1, 20)).toEqual({
        ok: false,
        motivo: 'PERCENTUAL_NEGATIVO',
      })
    })

    it('rejeita percentual acima do limite', () => {
      expect(validarPercentualPermitido(25, 20)).toEqual({
        ok: false,
        motivo: 'PERCENTUAL_ACIMA_DO_LIMITE',
      })
    })

    it('rejeita teto negativo', () => {
      expect(validarPercentualPermitido(5, -1)).toEqual({
        ok: false,
        motivo: 'TETO_NEGATIVO',
      })
    })
  })

  describe('aplicarDescontoGerenteSobreTotal', () => {
    it('aplica desconto válido e devolve total líquido coerente', () => {
      expect(
        aplicarDescontoGerenteSobreTotal({ totalLiquido: 100, percentual: 10, maxPermitido: 20 }),
      ).toEqual({
        percentualClamped: 10,
        descontoValor: 10,
        totalLiquidoComDesconto: 90,
      })
    })

    it('faz clamp quando percentual excede o teto', () => {
      expect(
        aplicarDescontoGerenteSobreTotal({ totalLiquido: 100, percentual: 50, maxPermitido: 20 }),
      ).toEqual({
        percentualClamped: 20,
        descontoValor: 20,
        totalLiquidoComDesconto: 80,
      })
    })

    it('zera tudo quando teto for 0', () => {
      expect(
        aplicarDescontoGerenteSobreTotal({ totalLiquido: 100, percentual: 10, maxPermitido: 0 }),
      ).toEqual({
        percentualClamped: 0,
        descontoValor: 0,
        totalLiquidoComDesconto: 100,
      })
    })

    it('mantém arredondamento de centavo entre web e local', () => {
      expect(
        aplicarDescontoGerenteSobreTotal({ totalLiquido: 33.33, percentual: 7, maxPermitido: 20 }),
      ).toEqual({
        percentualClamped: 7,
        descontoValor: 2.33,
        totalLiquidoComDesconto: 31,
      })
    })
  })
})
