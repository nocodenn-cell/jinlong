'use client'

import type { ReactNode } from 'react'
import {
  DataTable,
  type Column,
  type SortDirection,
} from '@/components/ui/DataTable'
import { MoneyText } from '@/components/ui/MoneyText'
import { StatusChip } from '@/components/ui/StatusChip'

export type EntityColumn<T> = Column<T> & {
  /** Coluna monetária — renderiza MoneyText se `cell` omitido. */
  money?: (row: T) => number
  moneyLocale?: string
  /** Coluna de status — renderiza StatusChip se `cell` omitido. */
  status?: (row: T) => { status: string; label?: string }
}

type EntityTableProps<T> = {
  columns: EntityColumn<T>[]
  data: T[]
  rowKey: (row: T) => string
  onSort?: (key: string, direction: SortDirection) => void
  sortKey?: string
  sortDirection?: SortDirection
  emptyState?: ReactNode
  emptyTitle?: string
  emptyDescription?: string
  rowActions?: (row: T) => ReactNode
  onRowClick?: (row: T) => void
  className?: string
  loading?: boolean
  skeletonRows?: number
  compact?: boolean
  stickyHeader?: boolean
  /**
   * Seleção múltipla (IX-SELECT). Quando definido, injeta coluna checkbox.
   */
  selection?: {
    selected: ReadonlySet<string>
    onChange: (next: Set<string>) => void
    selectAllLabel?: string
    selectRowLabel?: (row: T) => string
  }
}

function mapColumns<T>(
  columns: EntityColumn<T>[],
  selection?: EntityTableProps<T>['selection'],
  data?: T[],
  rowKey?: (row: T) => string,
): Column<T>[] {
  const mapped: Column<T>[] = columns.map((col) => {
    if (col.cell) return col
    if (col.money) {
      const get = col.money
      const locale = col.moneyLocale
      return {
        ...col,
        align: col.align ?? 'right',
        cell: (row) => <MoneyText value={get(row)} locale={locale} />,
        sortValue: col.sortValue ?? ((row) => get(row)),
      }
    }
    if (col.status) {
      const get = col.status
      return {
        ...col,
        cell: (row) => {
          const s = get(row)
          return <StatusChip status={s.status} label={s.label} />
        },
      }
    }
    return col
  })

  if (!selection || !rowKey || !data) return mapped

  const allIds = data.map(rowKey)
  const allSelected = allIds.length > 0 && allIds.every((id) => selection.selected.has(id))
  const selectCol: Column<T> = {
    key: '__select',
    header: selection.selectAllLabel ?? 'Selecionar',
    width: '2.5rem',
    headerCell: () => (
      <input
        type="checkbox"
        checked={allSelected}
        aria-label={selection.selectAllLabel ?? 'Selecionar todos da página'}
        onChange={(e) => {
          if (e.target.checked) selection.onChange(new Set(allIds))
          else selection.onChange(new Set())
        }}
      />
    ),
    cell: (row) => {
      const id = rowKey(row)
      return (
        <input
          type="checkbox"
          checked={selection.selected.has(id)}
          aria-label={selection.selectRowLabel?.(row) ?? 'Selecionar linha'}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const next = new Set(selection.selected)
            if (e.target.checked) next.add(id)
            else next.delete(id)
            selection.onChange(next)
          }}
        />
      )
    },
  }
  return [selectCol, ...mapped]
}

/**
 * EntityTable — DataTable opinativo para entidades ERP (Sprint 0).
 */
export function EntityTable<T>({
  columns,
  data,
  rowKey,
  selection,
  ...rest
}: EntityTableProps<T>) {
  const cols = mapColumns(columns, selection, data, rowKey)
  return <DataTable columns={cols} data={data} rowKey={rowKey} {...rest} />
}
