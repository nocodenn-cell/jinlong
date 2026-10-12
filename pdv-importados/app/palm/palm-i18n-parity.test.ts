import { describe, expect, it } from 'vitest'
import { getMessages } from '@/i18n/getMessages'

describe('palm i18n parity (pt/zh)', () => {
  it('o objeto palm tem as mesmas chaves em PT e ZH', () => {
    const pt = Object.keys(getMessages('pt').palm).sort()
    const zh = Object.keys(getMessages('zh').palm).sort()
    expect(zh).toEqual(pt)
  })
})
