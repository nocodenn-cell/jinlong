import { describe, expect, it } from 'vitest'
import { computeSparklineGeometry } from '@/lib/gerente/sparklineGeometry'

describe('computeSparklineGeometry', () => {
  it('com série vazia devolve paths vazios e baseline', () => {
    const g = computeSparklineGeometry([], 600, 80, 2)
    expect(g.linePath).toBe('')
    expect(g.areaPath).toBe('')
    expect(g.baseY).toBe(78)
  })

  it('normaliza X/Y e fecha área até baseline', () => {
    const g = computeSparklineGeometry(
      [
        { x: 0, y: 0 },
        { x: 23, y: 100 },
      ],
      600,
      80,
      2,
    )
    expect(g.linePath.startsWith('M')).toBe(true)
    expect(g.areaPath.endsWith('Z')).toBe(true)
    expect(g.linePath.includes('L')).toBe(true)
  })

  it('com todos os Y zero mantém linha no baseline', () => {
    const g = computeSparklineGeometry(
      [
        { x: 5, y: 0 },
        { x: 10, y: 0 },
      ],
      100,
      40,
      2,
    )
    expect(g.linePath.length).toBeGreaterThan(0)
    expect(g.baseY).toBe(38)
  })
})
