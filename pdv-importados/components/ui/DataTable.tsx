'use client'

/**
 * DataTable — única API de tabela do Design System (Fase 2 · Onda 2).
 * GerenteTable e tabelas manuais devem migrar para este componente.
 */

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'

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
  /** Peso visual do cabeçalho (compat GerenteTable). */
  priority?: 'primary' | 'secondary' | 'contextual'
}

type DataTableProps<T> = {
  columns: Column<T>[]
  data: T[]
  rowKey: (row: T) => string
  onSort?: (key: string, direction: SortDirection) => void
  sortKey?: string
  sortDirection?: SortDirection
  emptyState?: React.ReactNode
  emptyTitle?: string
  emptyDescription?: string
  rowActions?: (row: T) => React.ReactNode
  onRowClick?: (row: T) => void
  className?: string
  loading?: boolean
  skeletonRows?: number
  compact?: boolean
  stickyHeader?: boolean
}

type SortState = { key: string; direction: SortDirection } | null

const ALIGN_CLASS: Record<NonNullable<Column<unknown>['align']>, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
}

function headerPriorityCn(priority: Column<unknown>['priority']): string {
  if (priority === 'primary') return 'text-[var(--color-fg-muted)]'
  if (priority === 'contextual') return 'text-[var(--color-fg-subtle)] opacity-80'
  return 'text-[var(--color-fg-subtle)]'
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  onSort,
  sortKey,
  sortDirection,
  emptyState,
  emptyTitle = 'Nenhum registro encontrado',
  emptyDescription,
  rowActions,
  onRowClick,
  className,
  loading = false,
  skeletonRows = 6,
  compact = false,
  stickyHeader = false,
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
  const cellPy = compact ? 'py-1.5' : 'py-2.5'

  return (
    <div
      className={cn(
        'overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]',
        className,
      )}
    >
      <table
        className="w-full border-collapse text-left"
        role="table"
        aria-rowcount={loading ? skeletonRows : data.length}
        aria-colcount={colSpan}
        aria-busy={loading || undefined}
      >
        <thead className={cn(stickyHeader && 'sticky top-0 z-[var(--z-sticky)] bg-[var(--color-surface-soft)]')}>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-soft)]">
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
                    'px-3 text-caption font-semibold uppercase tracking-[var(--letter-spacing-wide)]',
                    cellPy,
                    headerPriorityCn(col.priority),
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
            {rowActions ? (
              <th className={cn('w-px px-3', cellPy)} aria-label="Ações" />
            ) : null}
          </tr>
        </thead>

        <tbody>
          {loading ? (
            Array.from({ length: skeletonRows }).map((_, i) => (
              <tr key={`sk-${i}`} className="border-t border-[var(--color-border)]">
                {columns.map((col) => (
                  <td key={col.key} className={cn('px-3', cellPy)}>
                    <Skeleton className="h-4 w-full" />
                  </td>
                ))}
                {rowActions ? (
                  <td className={cn('px-3', cellPy)}>
                    <Skeleton className="ml-auto h-4 w-12" />
                  </td>
                ) : null}
              </tr>
            ))
          ) : sortedData.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="p-0">
                {emptyState ?? (
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                )}
              </td>
            </tr>
          ) : (
            sortedData.map((row) => (
              <tr
                key={rowKey(row)}
                className={cn(
                  'border-t border-[var(--color-border)] transition-colors hover:bg-[var(--color-surface-soft)]',
                  onRowClick && 'cursor-pointer',
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-3 text-caption align-middle text-[var(--color-fg-muted)]',
                      cellPy,
                      ALIGN_CLASS[col.align ?? 'left'],
                      col.align === 'right' && 'tabular-nums',
                      col.className,
                    )}
                  >
                    {col.cell ? col.cell(row) : null}
                  </td>
                ))}
                {rowActions ? (
                  <td className={cn('px-3 text-right align-middle', cellPy)}>
                    <span className="inline-flex">{rowActions(row)}</span>
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
    return (
      <ChevronsUpDown
        size={12}
        strokeWidth={2}
        aria-hidden
        className="text-[var(--color-fg-subtle)] opacity-50"
      />
    )
  }
  const Icon = direction === 'asc' ? ChevronUp : ChevronDown
  return <Icon size={12} strokeWidth={2.5} aria-hidden className="text-[var(--color-fg)]" />
}
