'use client'

import type { ReactNode } from 'react'
import { memo } from 'react'
import { cn } from '@/lib/utils'

/**
 * Prioridade semântica da coluna — controla peso visual do cabeçalho.
 *
 * primary:    texto-fg-1 font-medium  → valor, produto, cliente, nome
 * secondary:  texto-fg-2 (padrão)     → datas, status, tipo
 * contextual: texto-fg-3 text-[11px]  → IDs, operador, metadata, ações
 */
export type GerenteTableColumnPriority = 'primary' | 'secondary' | 'contextual'

export type GerenteTableColumn = {
  key: string
  header: ReactNode
  width?: string | number
  /** Alinhamento do cabeçalho e sugestão para células. Padrão: 'left'. */
  align?: 'left' | 'right' | 'center'
  /** Ativa tabular-nums + right-align automaticamente no <th>. */
  numeric?: boolean
  /** Peso visual da coluna. Padrão: 'secondary'. */
  priority?: GerenteTableColumnPriority
}

/** Retorna as classes Tailwind para um <td> de acordo com a prioridade de coluna. */
export function tableCellPriorityCn(
  priority: GerenteTableColumnPriority | undefined,
  ...extra: (string | undefined)[]
): string {
  switch (priority) {
    case 'primary':     return cn('text-jl-fg-1 font-medium', ...extra)
    case 'contextual':  return cn('text-jl-fg-3 text-[11px]', ...extra)
    default:            return cn('text-jl-fg-2', ...extra)
  }
}

type GerenteTableProps = Readonly<{
  columns: GerenteTableColumn[]
  children: ReactNode
  /** `dragon`: tabela para fundos escuros / dragon-glass-card */
  tone?: 'paper' | 'dragon'
  /** Reduz padding das linhas — ideal para grids de alta densidade. */
  compact?: boolean
}>

/**
 * Retorna classes base para <td> alinhado à direita com números tabulares.
 * Uso: <td className={tableCellNumericCn('px-3 py-2')}>
 */
export function tableCellNumericCn(...extra: (string | undefined)[]): string {
  return cn('text-right tabular-nums', ...extra)
}

/**
 * Tabela visual padronizada da área gerente (borda, cabeçalho).
 * Linhas vazias: renderize um <tr> com colSpan no próprio children.
 */
export const GerenteTable = memo(function GerenteTable({
  columns,
  children,
  tone = 'paper',
  compact = false,
}: GerenteTableProps) {
  const dragon = tone === 'dragon'

  return (
    <div
      className={cn(
        'overflow-x-auto overscroll-x-contain rounded-xl border shadow-sm [-webkit-overflow-scrolling:touch]',
        dragon ? 'gerente-table-dragon app-border app-surface-soft' : 'app-border app-surface',
      )}
    >
      <table
        className={cn(
          'w-full border-collapse text-sm',
          'app-surface-text',
        )}
      >
        <thead>
          <tr
            className={cn(
              'border-b text-left',
              dragon ? 'app-divider app-surface' : 'app-divider app-surface-soft',
            )}
          >
            {columns.map((column) => {
              const isRight  = column.numeric || column.align === 'right'
              const isCenter = !isRight && column.align === 'center'
              const pri      = column.priority ?? 'secondary'
              return (
                <th
                  key={column.key}
                  className={cn(
                    'whitespace-nowrap px-3',
                    compact ? 'py-[7px]' : 'py-2.5',
                    'text-[10px] font-semibold tracking-[0.07em] uppercase',
                    pri === 'primary'    && 'text-jl-fg-2',
                    pri === 'secondary'  && 'app-muted',
                    pri === 'contextual' && 'text-jl-fg-3 opacity-60',
                    isRight  && 'text-right',
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
        <tbody className="divide-y app-divider">
          {children}
        </tbody>
      </table>
    </div>
  )
})
