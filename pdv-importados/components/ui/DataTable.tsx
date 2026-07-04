'use client'

/**
 * FastProduct Admin — DataTable (Admin V2)
 */

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SortDirection = 'asc' | 'desc'

export type Column<T> = {
  key: string
  header: string
  cell?: (row: T) => React.ReactNode
  sortValue?: (row: T) => string | number
  align?: 'left' | 'right' | 'center'
  width?: string
  className?: string
  headerClassName?: string
}

type DataTableProps<T> = {
  columns: Column<T>[]
  data: T[]
  rowKey: (row: T) => string
  onSort?: (key: string, direction: SortDirection) => void
  sortKey?: string
  sortDirection?: SortDirection
  emptyState?: React.ReactNode
  rowActions?: (row: T) => React.ReactNode
  onRowClick?: (row: T) => void
  className?: string
}

type SortState = { key: string; direction: SortDirection } | null

const ALIGN_CLASS: Record<NonNullable<Column<unknown>['align']>, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  onSort,
  sortKey,
  sortDirection,
  emptyState,
  rowActions,
  onRowClick,
  className,
}: DataTableProps<T>) {
  const serverMode = typeof onSort === 'function'
  const [localSort, setLocalSort] = useState<SortState>(null)

  const activeSort: SortState = serverMode
    ? sortKey
      ? { key: sortKey, direction: sortDirection ?? 'asc' }
      : null
    : localSort

  const handleHeaderClick = (col: Column<T>) => {
    if (!col.sortValue) return
    const nextDir: SortDirection =
      activeSort?.key === col.key && activeSort.direction === 'asc' ? 'desc' : 'asc'

    if (serverMode) {
      onSort!(col.key, nextDir)
      return
    }
    setLocalSort((prev) => {
      if (prev?.key === col.key && prev.direction === 'desc') return null
      return { key: col.key, direction: nextDir }
    })
  }

  const sortedData = useMemo(() => {
    if (serverMode || !localSort) return data
    const col = columns.find((c) => c.key === localSort.key)
    if (!col?.sortValue) return data
    const getter = col.sortValue
    const dir = localSort.direction === 'asc' ? 1 : -1
    return [...data].sort((a, b) => {
      const av = getter(a)
      const bv = getter(b)
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv), 'pt-BR', { numeric: true }) * dir
    })
  }, [serverMode, localSort, data, columns])

  const colSpan = columns.length + (rowActions ? 1 : 0)

  return (
    <div className={cn('overflow-x-auto rounded-lg border border-jl-border-1', className)}>
      <table
        className="w-full border-collapse text-left"
        role="table"
        aria-rowcount={data.length}
        aria-colcount={columns.length + (rowActions ? 1 : 0)}
      >
        <thead>
          <tr className="border-b border-jl-border-1">
            {columns.map((col) => {
              const sortable = !!col.sortValue
              const isActive = activeSort?.key === col.key
              const alignClass = ALIGN_CLASS[col.align ?? 'left']
              const sortStatus = isActive
                ? activeSort.direction === 'asc'
                  ? 'ordem crescente'
                  : 'ordem decrescente'
                : sortable
                  ? 'não ordenado'
                  : null
              const sortLabel = sortable
                ? `${col.header}, ${sortStatus}. Clique para ${isActive && activeSort.direction === 'asc' ? 'inverter para decrescente' : 'ordenar'}`
                : col.header
              return (
                <th
                  key={col.key}
                  scope="col"
                  style={{ width: col.width }}
                  className={cn(
                    'px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-jl-fg-3',
                    alignClass,
                    sortable && 'cursor-pointer select-none',
                    col.headerClassName,
                  )}
                  onClick={sortable ? () => handleHeaderClick(col) : undefined}
                  aria-label={sortLabel}
                  aria-sort={
                    isActive
                      ? activeSort.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : sortable
                        ? 'none'
                        : undefined
                  }
                >
                  <span
                    className={cn(
                      'inline-flex items-center gap-1',
                      col.align === 'right' && 'flex-row-reverse',
                    )}
                  >
                    {col.header}
                    {sortable ? (
                      <SortIcon active={isActive} direction={isActive ? activeSort.direction : undefined} />
                    ) : null}
                  </span>
                </th>
              )
            })}
            {rowActions ? <th className="w-px px-3 py-2.5" aria-label="Ações" /> : null}
          </tr>
        </thead>

        <tbody>
          {sortedData.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="px-3 py-10 text-center text-[12px] text-jl-fg-3">
                {emptyState ?? 'Nenhum registro encontrado'}
              </td>
            </tr>
          ) : (
            sortedData.map((row) => (
              <tr
                key={rowKey(row)}
                className={cn(
                  'group border-t border-jl-border-1 transition-colors hover:bg-white/[0.03]',
                  onRowClick && 'cursor-pointer',
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-3 py-2.5 text-[12px] align-middle text-jl-fg-2',
                      ALIGN_CLASS[col.align ?? 'left'],
                      col.align === 'right' && 'tabular-nums',
                      col.className,
                    )}
                  >
                    {col.cell ? col.cell(row) : null}
                  </td>
                ))}
                {rowActions ? (
                  <td className="px-3 py-2.5 text-right align-middle">
                    <span className="inline-flex opacity-0 transition-opacity group-hover:opacity-100">
                      {rowActions(row)}
                    </span>
                  </td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function SortIcon({ active, direction }: { active: boolean; direction?: SortDirection }) {
  if (!active) {
    return <ChevronsUpDown size={12} strokeWidth={2} aria-hidden className="text-jl-fg-3 opacity-50" />
  }
  const Icon = direction === 'asc' ? ChevronUp : ChevronDown
  return <Icon size={12} strokeWidth={2.5} aria-hidden className="text-jl-fg-1" />
}
