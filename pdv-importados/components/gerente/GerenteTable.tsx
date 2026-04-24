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
 * Linhas vazias: renderize um &lt;tr&gt; com colSpan no próprio children.
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
        'overflow-x-auto rounded-xl border shadow-sm',
        dragon ? 'gerente-table-dragon border-slate-600/50 bg-slate-950/35' : 'border-slate-200 bg-white',
      )}
    >
      <table
        className={cn(
          'w-full border-collapse text-sm',
          dragon ? 'text-slate-100' : 'text-slate-900',
        )}
      >
        <thead>
          <tr
            className={cn(
              'border-b text-left',
              dragon ? 'border-slate-600/60 bg-slate-900/70' : 'border-slate-200 bg-slate-100',
            )}
          >
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  'whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide',
                  dragon ? 'text-slate-300' : 'text-slate-600',
                )}
                style={column.width !== undefined ? { width: column.width } : undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={cn('divide-y', dragon ? 'divide-slate-700/50' : 'divide-slate-100')}>
          {children}
        </tbody>
      </table>
    </div>
  )
})
