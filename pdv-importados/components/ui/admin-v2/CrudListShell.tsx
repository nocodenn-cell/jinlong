import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { SectionCard } from './SectionCard'

type CrudListShellProps = {
  /** Título da seção da lista (opcional). */
  title?: string
  /** Contagem / meta à direita do título. */
  meta?: ReactNode
  /** Busca + filtros + botão Novo. */
  toolbar?: ReactNode
  /** Barra de seleção em lote. */
  bulkBar?: ReactNode
  /** DataTable ou conteúdo principal. */
  children: ReactNode
  /** Paginação / sentinel. */
  footer?: ReactNode
  className?: string
}

/**
 * CrudListShell — layout CRUD de referência (Catálogo Onda 5).
 *
 * Ordem: toolbar → bulk → tabela → footer.
 * Reutilizar em Clientes, Estoque, Financeiro, etc.
 */
export function CrudListShell({
  title,
  meta,
  toolbar,
  bulkBar,
  children,
  footer,
  className,
}: CrudListShellProps) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {toolbar ? <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">{toolbar}</div> : null}
      {bulkBar ? (
        <div className="flex flex-wrap items-center gap-2 rounded-card border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2">
          {bulkBar}
        </div>
      ) : null}
      <SectionCard title={title} action={meta} className="overflow-hidden">
        {children}
      </SectionCard>
      {footer ? <div className="flex items-center justify-between gap-3">{footer}</div> : null}
    </div>
  )
}
