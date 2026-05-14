'use client'

import type { ReactNode } from 'react'
import { memo } from 'react'
import type { GerenteTableDensity } from '@/components/gerente/GerenteTableDensityContext'
import { useGerenteTableDensity } from '@/components/gerente/GerenteTableDensityContext'
import { cn } from '@/lib/utils'

export type GerenteTableColumn = {
  key: string
  header: ReactNode
  width?: string | number
}

type GerenteTableProps = Readonly<{
  columns: GerenteTableColumn[]
  children: ReactNode
  /** `dragon`: tabela para fundos escuros / dragon-glass-card */
  tone?: 'paper' | 'dragon'
  /** Sobrescreve densidade do contexto (ex.: relatório export-only) */
  density?: GerenteTableDensity
}>

/**
 * Tabela visual padronizada da área gerente (borda, cabeçalho).
 * Linhas vazias: renderize um &lt;tr&gt; com colSpan no próprio children.
 */
export const GerenteTable = memo(function GerenteTable({
  columns,
  children,
  tone = 'paper',
  density: densityProp,
}: GerenteTableProps) {
  const dragon = tone === 'dragon'
  const densityFromCtx = useGerenteTableDensity()
  const density = densityProp ?? densityFromCtx
  const compact = density === 'compact'

  return (
    <div
      data-gerente-table-density={density}
      className={cn(
        'overflow-x-auto overscroll-x-contain rounded-xl border shadow-sm [-webkit-overflow-scrolling:touch]',
        dragon ? 'gerente-table-dragon app-border app-surface-soft' : 'app-border app-surface',
      )}
    >
      <table
        className={cn(
          'w-full border-collapse',
          compact ? 'text-xs' : 'text-sm',
          dragon ? 'app-surface-text' : 'app-surface-text',
        )}
      >
        <thead>
          <tr
            className={cn(
              'border-b text-left',
              dragon ? 'app-divider app-surface' : 'app-divider app-surface-soft',
            )}
          >
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  'whitespace-nowrap font-semibold uppercase tracking-wide',
                  compact ? 'px-2 py-1.5 text-[10px]' : 'px-3 py-3 text-sm',
                  dragon ? 'app-muted' : 'app-muted',
                )}
                style={column.width !== undefined ? { width: column.width } : undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody
          className={cn(
            'divide-y app-divider',
            compact &&
              '[&_td]:!px-2 [&_td]:!py-1.5 [&_td]:!text-xs [&_th]:!px-2 [&_th]:!py-1.5 [&_th]:!text-xs',
          )}
        >
          {children}
        </tbody>
      </table>
    </div>
  )
})
