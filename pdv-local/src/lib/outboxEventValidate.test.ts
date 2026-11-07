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
        caixa_id: UUID3,
        loja_id: UUID,
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

  it('rejeita VENDA_REGISTRADA sem caixa_id (registrar_venda_com_itens exige p_caixa_id)', () => {
    const r = validateNormalizedEvent({
      id: UUID,
      tipo: 'VENDA_REGISTRADA',
      created_at: '2026-01-01T12:00:00.000Z',
      payload: {
        venda_id: UUID2,
        caixa_id: null,
        forma_pagamento: 'DINHEIRO',
        total_bruto: 10,
        total_desconto: 0,
        total_liquido: 10,
        itens: [
          { produto_id: UUID3, quantidade: 1, preco_original: 10, preco_unitario: 10 },
        ],
      },
    })
    expect(r).toEqual({ ok: false, error: 'caixa_id inválido' })
  })

  it('rejeita VENDA_REGISTRADA sem loja_id', () => {
    const r = validateNormalizedEvent({
      id: UUID,
      tipo: 'VENDA_REGISTRADA',
      created_at: '2026-01-01T12:00:00.000Z',
      payload: {
        venda_id: UUID2,
        caixa_id: UUID3,
        forma_pagamento: 'DINHEIRO',
        total_bruto: 10,
        total_desconto: 0,
        total_liquido: 10,
        itens: [{ produto_id: UUID3, quantidade: 1, preco_original: 10, preco_unitario: 10 }],
      },
    })
    expect(r).toEqual({ ok: false, error: 'loja_id inválido' })
  })

  it('aceita CAIXA_ABERTO válido', () => {
    const r = validateNormalizedEvent({
      id: UUID,
      tipo: 'CAIXA_ABERTO',
      created_at: '2026-01-01T12:00:00.000Z',
      payload: { id: UUID2, valor_inicial: 100, loja_id: UUID },
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

  it('CAIXA_FECHADO aceita fechamento_observacao opcional', () => {
    const r = validateNormalizedEvent({
      id: UUID,
      tipo: 'CAIXA_FECHADO',
      created_at: '2026-01-02T10:00:00.000Z',
      payload: {
        id: UUID2,
        data_fechamento: '2026-01-02T10:00:00.000Z',
        valor_fechamento: 10,
        fechamento_observacao: 'Fecho conferido',
      },
    })
    expect(r).toEqual({ ok: true })
  })

  it('CAIXA_FECHADO rejeita fechamento_observacao > 500', () => {
    const r = validateNormalizedEvent({
      id: UUID,
      tipo: 'CAIXA_FECHADO',
      created_at: '2026-01-02T10:00:00.000Z',
      payload: {
        id: UUID2,
        data_fechamento: '2026-01-02T10:00:00.000Z',
        valor_fechamento: 10,
        fechamento_observacao: 'x'.repeat(501),
      },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('500')
  })
})

describe('OPERADOR_EVENTO (login por PIN)', () => {
  const ok = {
    id: '11111111-1111-4111-8111-111111111111',
    tipo: 'OPERADOR_EVENTO',
    created_at: '2026-10-21T12:00:00Z',
    payload: { id: '22222222-2222-4222-8222-222222222222', loja_id: '33333333-3333-4333-8333-333333333333', usuario_id: null, tipo: 'SAIU' },
  }
  it('aceita evento válido e recusa PIN no payload', () => {
    expect(validateNormalizedEvent(ok)).toEqual({ ok: true })
    expect(validateNormalizedEvent({ ...ok, payload: { ...ok.payload, pin: '7391' } }).ok).toBe(false)
    expect(validateNormalizedEvent({ ...ok, payload: { ...ok.payload, loja_id: 'x' } }).ok).toBe(false)
  })
})
