import { describe, expect, it } from 'vitest'
import { detectModeViolations } from './detectModeViolations'
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

describe('detectModeViolations', () => {
  it('returns no violations for empty vendas', () => {
    expect(detectModeViolations(makeSnapshot())).toHaveLength(0)
  })

  it('detects venda with wrong caixa_id', () => {
    const snap = makeSnapshot({
      vendas: [
        { id: 'v1', caixa_id: 'other-caixa', status: 'CONCLUIDA', total_liquido: 50, forma_pagamento: 'DINHEIRO' },
      ],
    })
    const violations = detectModeViolations(snap)
    expect(violations.some((v) => v.code === 'VENDA_CAIXA_DIVERGENTE')).toBe(true)
  })

  it('detects orphan venda (no caixa_id)', () => {
    const snap = makeSnapshot({
      vendas: [
        { id: 'v1', caixa_id: null, status: 'CONCLUIDA', total_liquido: 50, forma_pagamento: 'PIX' },
      ],
    })
    const violations = detectModeViolations(snap)
    expect(violations.some((v) => v.code === 'VENDA_ORFA')).toBe(true)
  })

  it('detects divergent total_liquido vs item sum', () => {
    const snap = makeSnapshot({
      vendas: [
        { id: 'v1', caixa_id: 'c1', status: 'CONCLUIDA', total_liquido: 100, forma_pagamento: 'DINHEIRO' },
      ],
      itensPorVenda: {
        v1: [
          { id: 'i1', venda_id: 'v1', produto_id: 'p1', quantidade: 2, preco_unitario: 30, desconto_unitario: 0 },
        ],
      },
    })
    const violations = detectModeViolations(snap)
    expect(violations.some((v) => v.code === 'VENDA_TOTAL_DIVERGENTE')).toBe(true)
  })

  it('accepts matching total_liquido', () => {
    const snap = makeSnapshot({
      vendas: [
        { id: 'v1', caixa_id: 'c1', status: 'CONCLUIDA', total_liquido: 60, forma_pagamento: 'DINHEIRO' },
      ],
      itensPorVenda: {
        v1: [
          { id: 'i1', venda_id: 'v1', produto_id: 'p1', quantidade: 2, preco_unitario: 30, desconto_unitario: 0 },
        ],
      },
    })
    const violations = detectModeViolations(snap)
    expect(violations.some((v) => v.code === 'VENDA_TOTAL_DIVERGENTE')).toBe(false)
  })

  it('detects fechamento reconciliation mismatch', () => {
    const snap = makeSnapshot({
      valorSistemaCalculado: 100,
    })
    snap.caixa.status = 'FECHADO'
    snap.caixa.valor_fechamento = 150
    snap.caixa.fechamento_diferenca = 10 // should be 50
    const violations = detectModeViolations(snap)
    expect(violations.some((v) => v.code === 'FECHAMENTO_RECONCILIACAO')).toBe(true)
  })
})
