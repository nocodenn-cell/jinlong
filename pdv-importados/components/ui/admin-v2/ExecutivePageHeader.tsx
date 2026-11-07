import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { PageActions, type PageActionSecondaryItem } from './PageActions'

type ExecutivePageHeaderProps = {
  title: string
  subtitle?: string
  /** Filtros compactos (ex.: período). */
  filters?: ReactNode
  /** CTAs primários — botões visíveis. */
  primaryActions?: ReactNode
  /** Ações secundárias no dropdown unificado. */
  secondaryActions?: readonly PageActionSecondaryItem[]
  secondaryActionsLabel?: string
  /** @deprecated Preferir `primaryActions` — compat com `PageHeader.actions`. */
  actions?: ReactNode
  className?: string
}

/**
 * ExecutivePageHeader — topo canônico das abas BI / dashboards executivos.
 * Agrupa ações secundárias em dropdown para liberar área útil.
 */
export function ExecutivePageHeader({
  title,
  subtitle,
  filters,
  primaryActions,
  secondaryActions,
  secondaryActionsLabel,
  actions,
  className,
}: ExecutivePageHeaderProps) {
  const primary = primaryActions ?? actions

  return (
    <header
      className={cn('mb-5 border-b border-[var(--color-border)] pb-5', className)}
      data-testid="executive-page-header"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-h2 font-bold tracking-tight text-fg md:text-h1">{title}</h1>
          {subtitle ? <p className="mt-2 text-body text-fg-subtle">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {filters}
          <PageActions secondary={secondaryActions} secondaryLabel={secondaryActionsLabel}>
            {primary}
          </PageActions>
        </div>
      </div>
    </header>
  )
}
