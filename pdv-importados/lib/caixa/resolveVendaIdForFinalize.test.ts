import { describe, expect, it } from 'vitest'
import { resolveVendaIdForFinalize } from './resolveVendaIdForFinalize'

describe('resolveVendaIdForFinalize', () => {
  it('reutiliza idempotencyKey quando fornecida', () => {
    const key = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
    const r1 = resolveVendaIdForFinalize({
      idempotencyKey: key,
      randomUuid: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    })
    const r2 = resolveVendaIdForFinalize({
      idempotencyKey: key,
      randomUuid: () => 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    })
    expect(r1).toBe(key)
    expect(r2).toBe(key)
  })

  it('gera UUID aleatório quando idempotencyKey ausente', () => {
    const uuid = '11111111-1111-1111-1111-111111111111'
    const result = resolveVendaIdForFinalize({ randomUuid: () => uuid })
    expect(result).toBe(uuid)
  })
})
