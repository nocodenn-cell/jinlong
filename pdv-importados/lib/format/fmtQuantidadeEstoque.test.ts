import { describe, expect, it } from 'vitest'
import { fmtQuantidadeEstoque } from './fmtQuantidadeEstoque'

describe('fmtQuantidadeEstoque', () => {
  it('formats integer without trailing decimals', () => {
    expect(fmtQuantidadeEstoque(10)).toBe('10')
  })

  it('formats up to 3 decimal places', () => {
    expect(fmtQuantidadeEstoque(1.5)).toBe('1,5')
    expect(fmtQuantidadeEstoque(2.125)).toBe('2,125')
  })

  it('rounds beyond 3 places', () => {
    expect(fmtQuantidadeEstoque(3.1234)).toBe('3,123')
  })

  it('formats zero', () => {
    expect(fmtQuantidadeEstoque(0)).toBe('0')
  })

  it('uses pt-BR thousands separator', () => {
    expect(fmtQuantidadeEstoque(1000)).toBe('1.000')
  })
})
