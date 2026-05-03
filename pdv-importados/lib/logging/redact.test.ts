import { describe, expect, it } from 'vitest'
import { redactForLog } from '@/shared/unified-logger'

describe('redactForLog', () => {
  it('mascara chaves sensíveis', () => {
    const input = {
      user: 'x',
      password: 'secret',
      nested: { access_token: 'abc', ok: 1 },
    }
    const out = redactForLog(input) as Record<string, unknown>
    expect(out.password).toBe('[REDACTED]')
    expect((out.nested as Record<string, unknown>).access_token).toBe('[REDACTED]')
    expect((out.nested as Record<string, unknown>).ok).toBe(1)
  })

  it('preserva primitivos e arrays', () => {
    expect(redactForLog(null)).toBeNull()
    expect(redactForLog([1, { senha: 'x' }])).toEqual([1, { senha: '[REDACTED]' }])
  })
})
