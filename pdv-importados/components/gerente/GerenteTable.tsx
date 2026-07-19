'use client'

import React, { type ReactNode, memo } from 'react'
import { cn } from '@/lib/utils'
import { DataTableSkeletonRows } from '@/components/gerente/DataTableSkeleton'

/**
 * @deprecated Fase 2 · Onda 2 — use `DataTable` de `@/components/ui/DataTable`.
 * Mantido como shim visual alinhado ao DS (radius/border/focus tokens).
 * Novas listagens NÃO devem importar este arquivo.
 */

export type GerenteTableColumnPriority = 'primary' | 'secondary' | 'contextual'

export type GerenteTableColumn = {
  key: string
  header: ReactNode
  width?: string | number
  align?: 'left' | 'right' | 'center'
  numeric?: boolean
  priority?: GerenteTableColumnPriority
}

export function tableCellPriorityCn(
  priority: GerenteTableColumnPriority | undefined,
  ...extra: (string | undefined)[]
): string {
  switch (priority) {
    case 'primary':
      return cn('font-medium text-[var(--color-fg)]', ...extra)
    case 'contextual':
      return cn('text-caption text-[var(--color-fg-subtle)]', ...extra)
    default:
      return cn('text-[var(--color-fg-muted)]', ...extra)
  }
}

type GerenteTableProps = Readonly<{
  columns: GerenteTableColumn[]
  children: ReactNode
  tone?: 'paper' | 'dragon'
  compact?: boolean
  loading?: boolean
  skeletonRows?: number
}>

export function tableCellNumericCn(...extra: (string | undefined)[]): string {
  return cn('text-right tabular-nums', ...extra)
}

export const GerenteTable = memo(function GerenteTable({
  columns,
  children,
  compact = false,
  loading = false,
  skeletonRows = 6,
}: GerenteTableProps) {
  return (
    <div
      className={cn(
        'overflow-x-auto overscroll-x-contain rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)] [-webkit-overflow-scrolling:touch]',
      )}
    >
      <table className="w-full border-collapse text-body text-[var(--color-fg)]">
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-soft)] text-left">
            {columns.map((column) => {
              const isRight = column.numeric || column.align === 'right'
              const isCenter = !isRight && column.align === 'center'
              const pri = column.priority ?? 'secondary'
              return (
                <th
                  key={column.key}
                  className={cn(
                    'whitespace-nowrap px-3 text-caption font-semibold uppercase tracking-[var(--letter-spacing-wide)]',
                    compact ? 'py-1.5' : 'py-2.5',
                    pri === 'primary' && 'text-[var(--color-fg-muted)]',
                    pri === 'secondary' && 'text-[var(--color-fg-subtle)]',
                    pri === 'contextual' && 'text-[var(--color-fg-subtle)] opacity-80',
                    isRight && 'text-right',
                    isCenter && 'text-center',
                    column.numeric && 'tabular-nums',
                  )}
                  style={column.width !== undefined ? { width: column.width } : undefined}
                >
                  {column.header}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {loading ? (
            <DataTableSkeletonRows columns={columns} rows={skeletonRows} compact={compact} />
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  )
})
