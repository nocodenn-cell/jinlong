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

  it('#20 yMaxOverride compartilha a escala Y entre duas curvas', () => {
    const hoje = [{ x: 0, y: 50 }, { x: 23, y: 50 }]
    const fantasma = [{ x: 0, y: 100 }, { x: 23, y: 100 }]
    const sharedMax = 100
    // Sem override, ambas usariam o próprio máximo → y=50 e y=100 cairiam no MESMO
    // ponto (topo). Com override compartilhado, a curva de 50 fica no MEIO.
    const gHoje = computeSparklineGeometry(hoje, 600, 80, 2, sharedMax)
    const gFant = computeSparklineGeometry(fantasma, 600, 80, 2, sharedMax)
    const yHoje = Number(gHoje.linePath.split(' ')[2]) // primeiro Y
    const yFant = Number(gFant.linePath.split(' ')[2])
    // Fantasma (valor maior) deve estar acima (Y menor no SVG) que hoje.
    expect(yFant).toBeLessThan(yHoje)
    // Hoje (metade do máximo) ~ meio da altura útil; fantasma ~ topo (padding).
    expect(yFant).toBeCloseTo(2, 1)
    expect(yHoje).toBeCloseTo(40, 0)
  })
})
