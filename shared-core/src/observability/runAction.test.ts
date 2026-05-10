import { describe, expect, it, vi } from 'vitest'
import { runActionWithObservability } from './runAction'

describe('runActionWithObservability', () => {
  it('retorna actionOk quando fn resolve', async () => {
    const r = await runActionWithObservability('test_stage', async () => 7)
    expect(r).toEqual({ ok: true, data: 7 })
  })

  it('retorna actionFail e chama sink em erro', async () => {
    const sink = vi.fn()
    const r = await runActionWithObservability(
      'test_stage',
      async () => {
        throw new Error('boom')
      },
      sink,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('boom')
    expect(sink).toHaveBeenCalledTimes(1)
    expect(sink.mock.calls[0]?.[0]).toBe('error')
    expect(sink.mock.calls[0]?.[1]).toMatchObject({
      stage: 'test_stage',
      event: 'action_unhandled_rejection',
      error_message: 'boom',
    })
  })
})
