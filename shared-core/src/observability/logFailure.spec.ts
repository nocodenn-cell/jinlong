import { describe, expect, it, vi } from 'vitest'
import { buildActionFailurePayload, logActionFailure } from './logFailure'

describe('buildActionFailurePayload', () => {
  it('extracts message from Error instance', () => {
    const payload = buildActionFailurePayload('stage', 'event', new Error('boom'))
    expect(payload.error_message).toBe('boom')
    expect(payload.stage).toBe('stage')
    expect(payload.event).toBe('event')
  })

  it('uses string error directly', () => {
    const payload = buildActionFailurePayload('s', 'e', 'string error')
    expect(payload.error_message).toBe('string error')
  })

  it('JSON-stringifies non-string/non-Error values', () => {
    const payload = buildActionFailurePayload('s', 'e', { code: 42 })
    expect(payload.error_message).toBe('{"code":42}')
  })

  it('includes context when provided', () => {
    const ctx = { userId: 'u1', retryCount: 3 }
    const payload = buildActionFailurePayload('s', 'e', 'err', ctx)
    expect(payload.ctx).toEqual(ctx)
  })

  it('sets ctx to undefined when not provided', () => {
    const payload = buildActionFailurePayload('s', 'e', 'err')
    expect(payload.ctx).toBeUndefined()
  })
})

describe('logActionFailure', () => {
  it('calls sink with level and payload', () => {
    const sink = vi.fn()
    const payload = { stage: 's', event: 'e', error_message: 'err', ctx: undefined }
    logActionFailure(sink, 'error', payload)
    expect(sink).toHaveBeenCalledWith('error', payload)
  })

  it('does nothing when sink is undefined', () => {
    expect(() =>
      logActionFailure(undefined, 'warn', {
        stage: 's',
        event: 'e',
        error_message: 'err',
        ctx: undefined,
      }),
    ).not.toThrow()
  })
})
