import { describe, expect, it } from 'vitest'
import { raceWithScanAbort } from './webCaixaScanAbort'

describe('raceWithScanAbort', () => {
  it('não chama startWork se signal já abortado', async () => {
    const ac = new AbortController()
    ac.abort()
    let started = false
    const r = await raceWithScanAbort(ac.signal, async () => {
      started = true
      return 42
    })
    expect(r).toEqual({ ok: false, reason: 'aborted' })
    expect(started).toBe(false)
  })

  it('sem signal executa startWork', async () => {
    const r = await raceWithScanAbort(undefined, async () => 'ok')
    expect(r).toEqual({ ok: true, value: 'ok' })
  })
})
