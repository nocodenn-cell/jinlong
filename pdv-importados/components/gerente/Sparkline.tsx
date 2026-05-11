import { cn } from '@/lib/utils'
import {
  computeSparklineGeometry,
  type SparklinePoint,
} from '@/lib/gerente/sparklineGeometry'

export type { SparklinePoint }

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
  const { linePath, areaPath, baseY } = computeSparklineGeometry(points, width, height, padding)

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
