import { describe, expect, it, vi } from 'vitest'
import { resolveVendaIdForFinalize } from './resolveVendaIdForFinalize'

describe('resolveVendaIdForFinalize', () => {
  it('reutiliza idempotencyKey quando fluxo unificado está ativo', () => {
    const key = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
    const r1 = resolveVendaIdForFinalize({
      useUnifiedSalesFlow: true,
      idempotencyKey: key,
      randomUuid: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    })
    const r2 = resolveVendaIdForFinalize({
      useUnifiedSalesFlow: true,
      idempotencyKey: key,
      randomUuid: () => 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    })
    expect(r1).toBe(key)
    expect(r2).toBe(key)
  })

  it('ignora chave quando fluxo legado e gera UUID novo a cada chamada', () => {
    const gen = vi.fn(() => '11111111-1111-1111-1111-111111111111')
    const a = resolveVendaIdForFinalize({
      useUnifiedSalesFlow: false,
      idempotencyKey: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      randomUuid: gen,
    })
    const b = resolveVendaIdForFinalize({
      useUnifiedSalesFlow: false,
      idempotencyKey: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      randomUuid: gen,
    })
    expect(a).toBe('11111111-1111-1111-1111-111111111111')
    expect(b).toBe('11111111-1111-1111-1111-111111111111')
    expect(gen).toHaveBeenCalledTimes(2)
  })
})
