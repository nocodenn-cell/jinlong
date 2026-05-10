import { describe, expect, it } from 'vitest'
import { actionFail, actionOk } from '../../../shared-core/src/result/actionResult'
import { actionResultToLegacyData, transferenciaActionResultToLegacy } from './actionResultAdapters'

describe('actionResultAdapters', () => {
  it('transferenciaActionResultToLegacy mapeia ok e erro', () => {
    expect(transferenciaActionResultToLegacy(actionOk({ transferenciaId: 'tid-1' }))).toEqual({
      success: true,
      transferenciaId: 'tid-1',
    })
    expect(transferenciaActionResultToLegacy(actionFail('falhou'))).toEqual({
      success: false,
      error: 'falhou',
    })
  })

  it('actionResultToLegacyData mapeia data', () => {
    expect(actionResultToLegacyData(actionOk({ x: 1 }))).toEqual({ success: true, data: { x: 1 } })
    expect(actionResultToLegacyData(actionFail('e'))).toEqual({ success: false, error: 'e' })
  })
})
