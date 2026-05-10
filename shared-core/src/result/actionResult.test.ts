import { describe, expect, it } from 'vitest'
import {
  actionFail,
  actionOk,
  fromLegacyFailure,
  fromLegacySuccess,
  isActionOk,
} from './actionResult'

describe('actionResult', () => {
  it('actionOk envolve dados', () => {
    expect(actionOk({ id: 1 })).toEqual({ ok: true, data: { id: 1 } })
  })

  it('actionFail inclui código default UNKNOWN', () => {
    expect(actionFail('falhou')).toEqual({
      ok: false,
      error: 'falhou',
      errorCode: 'UNKNOWN',
    })
  })

  it('actionFail aceita errorCode', () => {
    expect(actionFail('x', { errorCode: 'NETWORK' })).toMatchObject({
      ok: false,
      errorCode: 'NETWORK',
    })
  })

  it('fromLegacySuccess / fromLegacyFailure', () => {
    expect(fromLegacySuccess({ success: true, data: 42 })).toEqual(actionOk(42))
    expect(fromLegacyFailure({ success: false, error: 'e' })).toEqual(
      expect.objectContaining({ ok: false, error: 'e' }),
    )
  })

  it('isActionOk discrimina', () => {
    const r = actionOk(1)
    expect(isActionOk(r)).toBe(true)
    expect(isActionOk(actionFail('x'))).toBe(false)
  })
})
