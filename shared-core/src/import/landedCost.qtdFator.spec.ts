import { describe, expect, it } from 'vitest'
import { quantidadeEstoqueConsistente } from './index'

/**
 * CALC-001.1 / P5 — a regra "estoque = comercial × fator" é exportada pelo motor para que o
 * formulário valide ANTES de salvar com a mesma aritmética (exata, sem tolerância) da simulação.
 */
describe('quantidadeEstoqueConsistente (mesma regra do LANDED_QTD_FATOR_INCONSISTENTE)', () => {
  it('10 caixas × 12 = 120 unidades', () => {
    expect(quantidadeEstoqueConsistente('10', '12', '120')).toBe(true)
  })
  it('estoque digitado igual à quantidade comercial com fator 12 → inconsistente', () => {
    expect(quantidadeEstoqueConsistente('10', '12', '12')).toBe(false)
  })
  it('fator 1 digitado como 11 (P4) → inconsistente', () => {
    expect(quantidadeEstoqueConsistente('100', '11', '100')).toBe(false)
  })
  it('frações exatas: 2,5 × 0,4 = 1', () => {
    expect(quantidadeEstoqueConsistente('2.5', '0.4', '1')).toBe(true)
  })
  it('produto que não cabe em 3 casas nunca é consistente: 3 × 0,333333 = 0,999999', () => {
    expect(quantidadeEstoqueConsistente('3', '0.333333', '1')).toBe(false)
    expect(quantidadeEstoqueConsistente('3', '0.333333', '0.999')).toBe(false)
  })
  it('entrada não numérica ou não positiva → false (não lança)', () => {
    expect(quantidadeEstoqueConsistente('abc', '1', '1')).toBe(false)
    expect(quantidadeEstoqueConsistente('0', '1', '0')).toBe(false)
    expect(quantidadeEstoqueConsistente('1', '1.1234567', '1')).toBe(false)
  })
})
