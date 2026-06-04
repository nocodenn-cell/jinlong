import React, { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = Readonly<{
  /** Filtros à esquerda do header (busca, chips de status). */
  filters?: ReactNode
  /** Texto/contagem auxiliar exibido antes das ações (ex.: "42 clientes"). */
  meta?: ReactNode
  /** Ação primária no canto superior-direito (Novo / Importar). */
  actions?: ReactNode
  /** Cartões de KPI no topo (opcional). */
  kpis?: ReactNode
  /** Barra de ações em massa — renderizada só quando passada (com seleção). */
  bulkBar?: ReactNode
  /** aria-label do landmark da bulkBar (ex.: "3 selecionados"). */
  bulkBarLabel?: string
  /** Rodapé: paginação ou sentinel de scroll infinito. */
  pagination?: ReactNode
  /** Corpo — normalmente um <GerenteTable>. */
  children: ReactNode
  className?: string
}>

/**
 * DataTablePage — shell único das listagens do gerente (achados #27/#28/#29 da
 * auditoria). Consolida a convenção que cada lista redescobria: filtros à
 * esquerda, meta + ação primária no canto sup-direito, barra de seleção em
 * massa, corpo da tabela e rodapé de paginação. Cada slot é opcional; o que
 * varia é só o conteúdo, não a estrutura.
 */
export function DataTablePage({
  filters,
  meta,
  actions,
  kpis,
  bulkBar,
  bulkBarLabel,
  pagination,
  children,
  className,
}: Props) {
  return (
    <div className={className}>
      {kpis && <div className="mb-4">{kpis}</div>}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{filters}</div>
        {(meta || actions) && (
          <div className="flex flex-shrink-0 items-center gap-2">
            {meta && <span className="text-xs text-jl-fg-3">{meta}</span>}
            {actions}
          </div>
        )}
      </div>

      {bulkBar && (
        <div
          role={bulkBarLabel ? 'region' : undefined}
          aria-label={bulkBarLabel}
          className={cn(
            'mb-3 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2',
            'border-amber-400/40 bg-amber-400/10',
          )}
        >
          {bulkBar}
        </div>
      )}

      {children}

      {pagination && <div className="mt-4 flex items-center justify-center">{pagination}</div>}
    </div>
  )
}
