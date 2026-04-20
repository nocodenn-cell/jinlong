import { describe, expect, it } from 'vitest'
import { normalizeOutboxRecord, validateNormalizedEvent } from './outboxEventValidate'

/** UUIDs v4 com variant RFC válida (8–b no 1º nibble do 4º grupo) — alinhado ao regex do validador. */
const UUID = '550e8400-e29b-41d4-a716-446655440000'
const UUID2 = '6ba7b810-9dad-41d1-80b4-00c04fd430c8'
const UUID3 = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'

describe('validateNormalizedEvent — idempotência de regras do contrato v1', () => {
  it('aceita VENDA_REGISTRADA com um item', () => {
    const r = validateNormalizedEvent({
      id: UUID,
      tipo: 'VENDA_REGISTRADA',
      created_at: '2026-01-01T12:00:00.000Z',
      payload: {
        venda_id: UUID2,
        forma_pagamento: 'DINHEIRO',
        total_bruto: 10,
        total_desconto: 0,
        total_liquido: 10,
        itens: [
          {
            produto_id: UUID3,
            quantidade: 1,
            preco_original: 10,
            preco_unitario: 10,
          },
        ],
      },
    })
    expect(r).toEqual({ ok: true })
  })

  it('aceita CAIXA_ABERTO válido', () => {
    const r = validateNormalizedEvent({
      id: UUID,
      tipo: 'CAIXA_ABERTO',
      created_at: '2026-01-01T12:00:00.000Z',
      payload: { id: UUID2, valor_inicial: 100 },
    })
    expect(r).toEqual({ ok: true })
  })

  it('rejeita CAIXA_ABERTO com valor_inicial não numérico', () => {
    const r = validateNormalizedEvent({
      id: UUID,
      tipo: 'CAIXA_ABERTO',
      created_at: '2026-01-01T12:00:00.000Z',
      payload: { id: UUID2, valor_inicial: '100' },
    })
    expect(r.ok).toBe(false)
  })

  it('aceita MOVIMENTO_CAIXA sangria', () => {
    const r = validateNormalizedEvent({
      id: UUID,
      tipo: 'MOVIMENTO_CAIXA',
      created_at: '2026-01-01T12:00:00.000Z',
      payload: { id: UUID2, caixa_id: UUID3, tipo: 'SANGRIA', valor: 25.5 },
    })
    expect(r).toEqual({ ok: true })
  })

  it('rejeita MOVIMENTO_CAIXA com tipo inválido', () => {
    const r = validateNormalizedEvent({
      id: UUID,
      tipo: 'MOVIMENTO_CAIXA',
      created_at: '2026-01-01T12:00:00.000Z',
      payload: { id: UUID2, caixa_id: UUID3, tipo: 'ESTORNO', valor: 1 },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('tipo movimento')
  })

  it('parse normalizeOutboxRecord + validação', () => {
    const row = {
      id: UUID,
      tipo: 'CAIXA_FECHADO',
      created_at: '2026-01-02T10:00:00.000Z',
      payload_json: JSON.stringify({
        id: UUID2,
        data_fechamento: '2026-01-02T10:00:00.000Z',
        valor_fechamento: 99.9,
      }),
    }
    const ev = normalizeOutboxRecord(row)
    expect(validateNormalizedEvent(ev)).toEqual({ ok: true })
  })
})
