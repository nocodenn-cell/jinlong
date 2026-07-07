import { describe, expect, it } from 'vitest'
import { detectInvariants } from './detectInvariants'
import type { PdvStateSnapshot } from './types'

function makeSnapshot(overrides: Partial<PdvStateSnapshot> = {}): PdvStateSnapshot {
  return {
    generatedAt: '2024-01-01T00:00:00Z',
    caixaVersion: 1,
    caixa: {
      id: 'c1',
      operador_id: 'op1',
      loja_id: 'l1',
      status: 'ABERTO',
      valor_inicial: 100,
      valor_fechamento: null,
      fechamento_diferenca: null,
      fechamento_observacao: null,
      data_abertura: '2024-01-01T08:00:00Z',
      data_fechamento: null,
    },
    vendas: [],
    itensPorVenda: {},
    valorSistemaCalculado: 100,
    ...overrides,
  }
}

describe('detectInvariants', () => {
  it('returns no violations for a valid open caixa', () => {
    const violations = detectInvariants(makeSnapshot())
    expect(violations).toHaveLength(0)
  })

  it('detects invalid caixa status', () => {
    const snap = makeSnapshot()
    snap.caixa.status = 'INVALID'
    const violations = detectInvariants(snap)
    expect(violations.some((v) => v.code === 'CAIXA_INCONSISTENT')).toBe(true)
  })

  it('detects missing operador_id', () => {
    const snap = makeSnapshot()
    snap.caixa.operador_id = null
    const violations = detectInvariants(snap)
    expect(violations.some((v) => v.code === 'CAIXA_INCONSISTENT')).toBe(true)
  })

  it('detects FECHADO without data_fechamento', () => {
    const snap = makeSnapshot()
    snap.caixa.status = 'FECHADO'
    snap.caixa.valor_fechamento = 100
    snap.caixa.data_fechamento = null
    const violations = detectInvariants(snap)
    expect(violations.some((v) => v.code === 'FECHAMENTO_INVALIDO')).toBe(true)
  })

  it('detects FECHADO without valor_fechamento', () => {
    const snap = makeSnapshot()
    snap.caixa.status = 'FECHADO'
    snap.caixa.data_fechamento = '2024-01-01T18:00:00Z'
    snap.caixa.valor_fechamento = null
    const violations = detectInvariants(snap)
    expect(violations.some((v) => v.code === 'FECHAMENTO_INVALIDO')).toBe(true)
  })

  it('detects large divergence without observation', () => {
    const snap = makeSnapshot({
      valorSistemaCalculado: 100,
    })
    snap.caixa.status = 'FECHADO'
    snap.caixa.data_fechamento = '2024-01-01T18:00:00Z'
    snap.caixa.valor_fechamento = 120
    snap.caixa.fechamento_diferenca = null
    snap.caixa.fechamento_observacao = ''
    const violations = detectInvariants(snap)
    expect(violations.some((v) => v.message.includes('Divergência'))).toBe(true)
  })

  it('accepts large divergence with valid observation', () => {
    const snap = makeSnapshot({
      valorSistemaCalculado: 100,
    })
    snap.caixa.status = 'FECHADO'
    snap.caixa.data_fechamento = '2024-01-01T18:00:00Z'
    snap.caixa.valor_fechamento = 120
    snap.caixa.fechamento_diferenca = null
    snap.caixa.fechamento_observacao = 'Cliente pagou a mais, verificado.'
    const violations = detectInvariants(snap)
    expect(violations.some((v) => v.message.includes('Divergência'))).toBe(false)
  })

  it('detects pending vendas on closed caixa', () => {
    const snap = makeSnapshot({
      valorSistemaCalculado: 100,
      vendas: [
        { id: 'v1', caixa_id: 'c1', status: 'PENDENTE', total_liquido: 50, forma_pagamento: 'DINHEIRO' },
      ],
    })
    snap.caixa.status = 'FECHADO'
    snap.caixa.data_fechamento = '2024-01-01T18:00:00Z'
    snap.caixa.valor_fechamento = 100
    const violations = detectInvariants(snap)
    expect(violations.some((v) => v.message.includes('não finalizada'))).toBe(true)
  })

  it('detects inconsistent fechamento_diferenca', () => {
    const snap = makeSnapshot({
      valorSistemaCalculado: 100,
    })
    snap.caixa.status = 'FECHADO'
    snap.caixa.data_fechamento = '2024-01-01T18:00:00Z'
    snap.caixa.valor_fechamento = 102
    snap.caixa.fechamento_diferenca = 10
    const violations = detectInvariants(snap)
    expect(violations.some((v) => v.message.includes('reconcilia'))).toBe(true)
  })
})
