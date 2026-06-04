/** Ponto da série da sparkline (compartilhado com o componente SVG). */
export type SparklinePoint = {
  x: number
  y: number
}

/** Geometria SVG da sparkline — extraída para testes sem React. */
export function computeSparklineGeometry(
  points: SparklinePoint[],
  width: number,
  height: number,
  padding = 2,
  /**
   * Escala Y compartilhada (#20). Quando a sparkline desenha uma curva fantasma
   * junto, ambas precisam do MESMO yMax p/ "mais alto = mais faturamento" ser
   * comparável. Sem override, usa o próprio máximo da série.
   */
  yMaxOverride?: number,
): {
  linePath: string
  areaPath: string
  baseY: number
  padding: number
} {
  const innerW = width - padding * 2
  const innerH = height - padding * 2
  const baseY = height - padding

  const ordered = [...points].sort((a, b) => a.x - b.x)
  const xs = ordered.map((p) => p.x)
  const ys = ordered.map((p) => p.y)
  const xMin = xs.length > 0 ? Math.min(...xs) : 0
  const xMax = xs.length > 0 ? Math.max(...xs) : 1
  const xSpan = xMax === xMin ? 1 : xMax - xMin
  const yMax = yMaxOverride !== undefined ? yMaxOverride : Math.max(...ys, 0)

  const coords = ordered.map((p) => {
    const nx = padding + ((p.x - xMin) / xSpan) * innerW
    const ny = yMax > 0 ? baseY - (p.y / yMax) * innerH : baseY
    return [nx, ny] as const
  })

  const linePath =
    coords.length > 0
      ? coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')
      : ''

  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1][0].toFixed(2)} ${baseY.toFixed(2)} L ${coords[0][0].toFixed(2)} ${baseY.toFixed(2)} Z`
      : ''

  return { linePath, areaPath, baseY, padding }
}
