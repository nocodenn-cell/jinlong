import { cn } from '@/lib/utils'

export type SparklinePoint = {
  /** Posição no eixo X (ex.: hora 0..23). */
  x: number
  /** Valor numérico no eixo Y. */
  y: number
}

interface SparklineProps {
  points: SparklinePoint[]
  /** Largura do viewBox SVG; o componente renderiza 100% do contêiner pai. */
  width?: number
  /** Altura do viewBox SVG. */
  height?: number
  /** Texto curto para acessibilidade. */
  ariaLabel: string
  className?: string
}

/**
 * Sparkline minimalista (sem dependência externa). Desenha uma área e uma
 * polilinha normalizada para o intervalo [0, max]; serve de glanceable
 * trend para KPIs do dashboard. Sem dados (ou tudo zero) renderiza um
 * baseline horizontal — útil para mostrar dia ainda sem vendas.
 */
export function Sparkline({
  points,
  width = 600,
  height = 80,
  ariaLabel,
  className,
}: SparklineProps) {
  const padding = 2
  const innerW = width - padding * 2
  const innerH = height - padding * 2
  const baseY = height - padding

  const ordered = [...points].sort((a, b) => a.x - b.x)
  const xs = ordered.map((p) => p.x)
  const ys = ordered.map((p) => p.y)
  const xMin = xs.length > 0 ? Math.min(...xs) : 0
  const xMax = xs.length > 0 ? Math.max(...xs) : 1
  const xSpan = xMax === xMin ? 1 : xMax - xMin
  const yMax = Math.max(...ys, 0)

  const coords = ordered.map((p) => {
    const nx = padding + ((p.x - xMin) / xSpan) * innerW
    const ny = yMax > 0
      ? baseY - (p.y / yMax) * innerH
      : baseY
    return [nx, ny] as const
  })

  const linePath = coords.length > 0
    ? coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')
    : ''

  const areaPath = coords.length > 0
    ? `${linePath} L ${coords[coords.length - 1][0].toFixed(2)} ${baseY.toFixed(2)} L ${coords[0][0].toFixed(2)} ${baseY.toFixed(2)} Z`
    : ''

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('h-20 w-full text-primary', className)}
    >
      {areaPath && (
        <path d={areaPath} fill="currentColor" fillOpacity={0.12} />
      )}
      {linePath && (
        <path
          d={linePath}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <line
        x1={padding}
        x2={width - padding}
        y1={baseY}
        y2={baseY}
        stroke="currentColor"
        strokeOpacity={0.15}
        strokeDasharray="2 4"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
