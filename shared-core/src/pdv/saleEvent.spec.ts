import { describe, expect, it } from 'vitest'

/** Contrato de idempotency_key com prefixo source (espelha migration 228). */
function vendaEventoIdempotencyKey(
  source: string,
  saleId: string,
  cancelled = false,
): string {
  return cancelled ? `${source}:cancel:${saleId}` : `${source}:${saleId}`
}

describe('venda_evento idempotency_key', () => {
  it('prefixo source distingue origens', () => {
    const saleId = '11111111-1111-4111-8111-111111111111'
    expect(vendaEventoIdempotencyKey('web_caixa', saleId)).toBe(`web_caixa:${saleId}`)
    expect(vendaEventoIdempotencyKey('sync_outbox', saleId)).toBe(`sync_outbox:${saleId}`)
    expect(vendaEventoIdempotencyKey('backfill', saleId)).toBe(`backfill:${saleId}`)
  })

  it('cancel usa sufixo :cancel:', () => {
    const saleId = '22222222-2222-4222-8222-222222222222'
    expect(vendaEventoIdempotencyKey('gerente_panel', saleId, true)).toBe(
      `gerente_panel:cancel:${saleId}`,
    )
  })

  it('retry com mesma key não duplicaria (chaves iguais)', () => {
    const key = vendaEventoIdempotencyKey('web_caixa', 'abc')
    expect(vendaEventoIdempotencyKey('web_caixa', 'abc')).toBe(key)
  })
})
