'use client'

import type { ReactNode } from 'react'
import { memo } from 'react'
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
}>

/**
 * Tabela visual padronizada da área gerente (borda, cabeçalho).
 * Linhas vazias: renderize um <tr> com colSpan no próprio children.
 */
export const GerenteTable = memo(function GerenteTable({
  columns,
  children,
  tone = 'paper',
}: GerenteTableProps) {
  const dragon = tone === 'dragon'

  return (
    <div
      className={cn(
        'overflow-x-auto overscroll-x-contain rounded-xl border shadow-sm transform-gpu [-webkit-overflow-scrolling:touch]',
        dragon ? 'gerente-table-dragon app-border app-surface-soft' : 'app-border app-surface',
      )}
    >
      <table
        className={cn(
          'w-full border-collapse text-sm',
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
                  'whitespace-nowrap px-3 py-3 text-sm font-semibold uppercase tracking-wide app-muted',
                )}
                style={column.width !== undefined ? { width: column.width } : undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y app-divider">
          {children}
        </tbody>
      </table>
    </div>
  )
})
