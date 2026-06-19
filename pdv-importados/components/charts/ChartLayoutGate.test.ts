import { describe, expect, it } from 'vitest'
import { isRenderableSize } from './ChartLayoutGate'

describe('isRenderableSize', () => {
  it('aceita dimensões positivas finitas', () => {
    expect(isRenderableSize(320, 180)).toBe(true)
    expect(isRenderableSize(1, 1)).toBe(true)
  })

  it('rejeita zero em qualquer eixo', () => {
    expect(isRenderableSize(0, 180)).toBe(false)
    expect(isRenderableSize(320, 0)).toBe(false)
    expect(isRenderableSize(0, 0)).toBe(false)
  })

  it('rejeita negativos e não-finitos', () => {
    expect(isRenderableSize(-10, 180)).toBe(false)
    expect(isRenderableSize(NaN, 180)).toBe(false)
    expect(isRenderableSize(320, Infinity)).toBe(false)
  })
})
