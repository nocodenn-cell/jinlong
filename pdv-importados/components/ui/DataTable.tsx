'use client'

/**
 * FastProduct Admin — DataTable (Fase 2)
 *
 * Tabela genérica do painel /admin. Nesta fase o sort é CLIENT-SIDE apenas
 * (useState + useMemo) — sem URL params. O sort server-side virá numa fase
 * posterior, quando mapearmos as queries de cada tela.
 *
 *   - `onSort` é OPCIONAL. Quando ausente, o comportamento padrão é SEM sort
 *     ativo; clicar num header ordenável passa a ordenar localmente.
 *   - Quando `onSort` é fornecido, a ordenação é DELEGADA ao chamador
 *     (modo server-side): o componente só dispara o callback e renderiza os
 *     dados na ordem em que chegam, sem ordenar localmente.
 *
 * Regras do design system:
 *   - SEMPRE empty state (nunca tabela vazia "muda").
 *   - Ações de linha visíveis só no hover (tr.group).
 *   - Sem virtualização (catálogo ~300 itens no máximo).
 */

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SortDirection = 'asc' | 'desc'

export type Column<T> = {
  key: string
  header: string
  /** Renderiza a célula. Default: String(row[key]) se `key` for campo de T. */
  cell?: (row: T) => React.ReactNode
  /** Valor usado para ordenação client-side. Habilita o sort na coluna. */
  sortValue?: (row: T) => string | number
  align?: 'left' | 'right' | 'center'
  /** Largura fixa opcional (ex.: '120px', '20%'). */
  width?: string
  className?: string
  /** Classe extra só no <th>. */
  headerClassName?: string
}

type DataTableProps<T> = {
  columns: Column<T>[]
  data: T[]
  rowKey: (row: T) => string
  /**
   * Modo server-side: se fornecido, a ordenação é delegada ao chamador e o
   * componente NÃO ordena localmente.
   */
  onSort?: (key: string, direction: SortDirection) => void
  /** Estado de ordenação controlado (modo server-side). */
  sortKey?: string
  sortDirection?: SortDirection
  /** Conteúdo do empty state. Default: texto simples. */
  emptyState?: React.ReactNode
  /** Ações por linha — renderizadas numa célula extra, visíveis só no hover. */
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

  // Estado local de sort (apenas modo client-side).
  const [localSort, setLocalSort] = useState<SortState>(null)

  // Sort efetivo exibido nos headers.
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
    // Ciclo client-side: asc → desc → sem sort.
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
    <div
      className={cn('overflow-x-auto rounded-[10px]', className)}
      style={{ border: '1px solid var(--fp-border)' }}
    >
      <table className="w-full border-collapse text-left">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--fp-border)' }}>
            {columns.map((col) => {
              const sortable = !!col.sortValue
              const isActive = activeSort?.key === col.key
              const alignClass = ALIGN_CLASS[col.align ?? 'left']
              return (
                <th
                  key={col.key}
                  scope="col"
                  style={{ width: col.width, color: 'var(--fp-text-muted)' }}
                  className={cn(
                    'px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.06em]',
                    alignClass,
                    sortable && 'cursor-pointer select-none',
                    col.headerClassName
                  )}
                  onClick={sortable ? () => handleHeaderClick(col) : undefined}
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
                      col.align === 'right' && 'flex-row-reverse'
                    )}
                  >
                    {col.header}
                    {sortable ? (
                      <SortIcon
                        active={isActive}
                        direction={isActive ? activeSort.direction : undefined}
                      />
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
              <td
                colSpan={colSpan}
                className="px-3 py-10 text-center text-[12px]"
                style={{ color: 'var(--fp-text-muted)' }}
              >
                {emptyState ?? 'Nenhum registro encontrado'}
              </td>
            </tr>
          ) : (
            sortedData.map((row) => (
              <tr
                key={rowKey(row)}
                className={cn('group transition-colors', onRowClick && 'cursor-pointer')}
                style={{ borderTop: '1px solid var(--fp-border-subtle)' }}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--fp-bg-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{ color: 'var(--fp-text-secondary)' }}
                    className={cn(
                      'px-3 py-2.5 text-[12px] align-middle',
                      ALIGN_CLASS[col.align ?? 'left'],
                      col.align === 'right' && 'tabular-nums',
                      col.className
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

// ─── Ícone de ordenação ─────────────────────────────────────────────────────

function SortIcon({ active, direction }: { active: boolean; direction?: SortDirection }) {
  if (!active) {
    return (
      <ChevronsUpDown
        size={12}
        strokeWidth={2}
        aria-hidden
        style={{ color: 'var(--fp-text-muted)', opacity: 0.5 }}
      />
    )
  }
  const Icon = direction === 'asc' ? ChevronUp : ChevronDown
  return <Icon size={12} strokeWidth={2.5} aria-hidden style={{ color: 'var(--fp-text-primary)' }} />
}
