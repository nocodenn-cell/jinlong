import { describe, expect, it } from 'vitest'
import { construirSegmentacaoRfv } from './rfvSegmentacao'

describe('construirSegmentacaoRfv', () => {
  it('agrega por cliente e prioriza valor', () => {
    const rows = construirSegmentacaoRfv(
      [
        { cliente_nome: 'Ana', data: '2026-10-05T12:00:00Z', total_liquido: 100, status: 'CONCLUIDA' },
        { cliente_nome: 'Ana', data: '2026-10-06T12:00:00Z', total_liquido: 50, status: 'CONCLUIDA' },
        { cliente_nome: 'Ana', data: '2026-10-07T12:00:00Z', total_liquido: 50, status: 'CONCLUIDA' },
        { cliente_nome: 'Bob', data: '2026-09-01T12:00:00Z', total_liquido: 20, status: 'CONCLUIDA' },
        { cliente_nome: 'Bob', data: '2026-09-01T13:00:00Z', total_liquido: 999, status: 'CANCELADA' },
      ],
      '2026-10-07',
    )
    expect(rows[0]?.cliente).toBe('Ana')
    expect(rows[0]?.frequencia).toBe(3)
    expect(rows[0]?.valor).toBe(200)
    expect(rows.find((r) => r.cliente === 'Bob')?.frequencia).toBe(1)
  })
})
