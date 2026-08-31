import { describe, expect, it } from 'vitest'
import { getMessages } from '@/i18n/getMessages'

const CAIXA_ERR_PREFIX = 'err_srv_'

function caixaErrKeys(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).filter((k) => k.startsWith(CAIXA_ERR_PREFIX) || k === 'msg_codigo_lido')
}

describe('caixa i18n parity (pt/zh)', () => {
  it('chaves err_srv_* e msg_codigo_lido têm paridade PT/ZH', () => {
    const ptCaixa = getMessages('pt').caixa as Record<string, unknown>
    const zhCaixa = getMessages('zh').caixa as Record<string, unknown>
    const keys = caixaErrKeys(ptCaixa)
    const zhKeys = new Set(caixaErrKeys(zhCaixa))

    const missingInZh = keys.filter((k) => !zhKeys.has(k))
    const missingInPt = [...zhKeys].filter((k) => !keys.includes(k))

    expect(missingInZh, `faltando em zh.json: ${missingInZh.join(', ')}`).toEqual([])
    expect(missingInPt, `faltando em pt.json: ${missingInPt.join(', ')}`).toEqual([])
  })
})
