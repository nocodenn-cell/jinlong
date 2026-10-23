import { describe, expect, it } from 'vitest'
import { aliquotaEfetivaAnexoI, faixaAnexoI, simular } from './simuladorHibrido'

describe('simulador Simples puro x híbrido', () => {
  it('alíquota efetiva do Anexo I', () => {
    expect(aliquotaEfetivaAnexoI(120_000)).toBeCloseTo(0.04)
    expect(aliquotaEfetivaAnexoI(600_000)).toBeCloseTo((600_000 * 0.095 - 13_860) / 600_000)
    expect(faixaAnexoI(360_000)).toBe(1)
    expect(faixaAnexoI(5_000_000)).toBe(-1)
  })

  it('puro: DAS cheio e crédito limitado à partilha', () => {
    const r = simular({ faturamentoMensal: 50_000, parcelaB2B: 1, comprasComCredito: 0, aliquotaCbs: 0.088, aliquotaIbs: 0.001 })
    const ef = (600_000 * 0.095 - 13_860) / 600_000
    expect(r.puro.das).toBeCloseTo(50_000 * ef, 2)
    expect(r.puro.creditoRepassado).toBeCloseTo(50_000 * ef * 0.155, 1)
    expect(r.hibrido.creditoRepassado).toBeCloseTo(50_000 * 0.089, 2)
    expect(r.hibrido.das).toBeCloseTo(50_000 * ef * 0.845, 1)
  })

  it('híbrido desconta crédito das compras e guarda saldo credor', () => {
    const r = simular({ faturamentoMensal: 10_000, parcelaB2B: 0.5, comprasComCredito: 15_000, aliquotaCbs: 0.088, aliquotaIbs: 0.001 })
    expect(r.hibrido.ibsCbsPorFora).toBe(0)
    expect(r.saldoCredor).toBeCloseTo(5_000 * 0.089, 2)
    expect(r.recomendacao).toBe('hibrido')
  })

  it('só varejo e sem compras com crédito: recomenda puro', () => {
    const r = simular({ faturamentoMensal: 30_000, parcelaB2B: 0, comprasComCredito: 0 })
    expect(r.custoExtraHibrido).toBeGreaterThan(0)
    expect(r.recomendacao).toBe('puro')
  })

  it('atacado forte com custo extra: avaliar', () => {
    const r = simular({ faturamentoMensal: 50_000, parcelaB2B: 0.9, comprasComCredito: 25_000 })
    expect(r.custoExtraHibrido).toBeGreaterThan(0)
    expect(r.creditoExtraClientes).toBeGreaterThan(r.custoExtraHibrido)
    expect(r.recomendacao).toBe('avaliar')
  })

  it('acima do limite do Simples e entradas inválidas', () => {
    expect(simular({ faturamentoMensal: 500_000, parcelaB2B: 1, comprasComCredito: 0 }).recomendacao).toBe('fora')
    const r = simular({ faturamentoMensal: NaN, parcelaB2B: 7, comprasComCredito: -5 })
    expect(r.puro.total).toBe(0)
  })
})
