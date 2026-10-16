import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type DenseDataColumn<T> = {
  id: string
  header: string
  /** Alinhamento; default `right` quando `numeric`. */
  align?: 'left' | 'right'
  /** Aplica `tabular-nums` e alinhamento à direita. */
  numeric?: boolean
  cell: (row: T) => ReactNode
  className?: string
}

type DenseDataTableProps<T> = {
  columns: readonly DenseDataColumn<T>[]
  rows: readonly T[]
  rowKey: (row: T) => string
  empty?: ReactNode
  className?: string
  caption?: string
}

function cellAlign(col: DenseDataColumn<unknown>): 'left' | 'right' {
  if (col.align) return col.align
  return col.numeric ? 'right' : 'left'
}

/**
 * DenseDataTable — tabela compacta com suporte a alinhamento numérico (`tabular-nums`).
 */
export function DenseDataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  className,
  caption,
}: DenseDataTableProps<T>) {
  if (rows.length === 0 && empty) {
    return <div data-testid="dense-data-table-empty">{empty}</div>
  }

  return (
    <div className={cn('admin-v2-dense-table-wrap overflow-x-auto', className)} data-testid="dense-data-table">
      <table className="admin-v2-dense-table w-full border-collapse text-left text-small">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            {columns.map((col) => {
              const align = cellAlign(col as DenseDataColumn<unknown>)
              return (
                <th
                  key={col.id}
                  scope="col"
                  className={cn(
                    'px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle',
                    align === 'right' && 'text-right',
                    col.className,
                  )}
                >
                  {col.header}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-[color-mix(in_srgb,var(--color-border)_60%,transparent)] last:border-0 hover:bg-[color-mix(in_srgb,var(--color-brand-primary)_4%,transparent)]"
            >
              {columns.map((col) => {
                const align = cellAlign(col as DenseDataColumn<unknown>)
                return (
                  <td
                    key={col.id}
                    className={cn(
                      'px-2 py-1.5 text-fg',
                      align === 'right' && 'text-right',
                      col.numeric && 'tabular-nums font-medium',
                      col.className,
                    )}
                  >
                    {col.cell(row)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
