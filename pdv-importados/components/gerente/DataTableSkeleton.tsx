import React from 'react'
import { cn } from '@/lib/utils'
import type { GerenteTableColumn } from '@/components/gerente/GerenteTable'

type Props = Readonly<{
  /** Mesmas colunas do GerenteTable — garante alinhamento/contagem idênticos. */
  columns: GerenteTableColumn[]
  /** Quantas linhas-fantasma renderizar. Default 6 (achado #28). */
  rows?: number
  /** Mesma densidade do GerenteTable. */
  compact?: boolean
}>

// Larguras determinísticas (sem random → SSR estável) que dão ritmo visual:
// a 1ª coluna (nome/primária) mais larga, numéricas mais curtas.
const WIDTHS = ['72%', '54%', '63%', '46%', '58%', '50%']

/**
 * DataTableSkeletonRows (#28) — linhas-fantasma com shimmer amber-soft, mesma
 * altura/colunas da row real. Renderiza `<tr>` para ir dentro do <tbody> do
 * GerenteTable. Anima via `.jl-shimmer` (para em prefers-reduced-motion).
 */
export function DataTableSkeletonRows({ columns, rows = 6, compact = true }: Props) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="app-divider" aria-hidden="true">
          {columns.map((c, i) => {
            const isRight = c.numeric || c.align === 'right'
            const isCenter = !isRight && c.align === 'center'
            const width = WIDTHS[(i + r) % WIDTHS.length]
            return (
              <td key={c.key} className={cn('px-3', compact ? 'py-2.5' : 'py-3')}>
                <div
                  className={cn(
                    'jl-shimmer h-3.5 rounded',
                    isRight && 'ml-auto',
                    isCenter && 'mx-auto',
                  )}
                  style={{ width }}
                />
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}
