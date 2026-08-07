import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { PageHeader } from './PageHeader'

type PageShellProps = {
  title: string
  subtitle?: string
  /** Filtros compactos no header (ex.: período). */
  filters?: ReactNode
  /** CTAs — preferir `PageActions`. */
  actions?: ReactNode
  /** Faixa de KPIs abaixo do header. */
  kpi?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * PageShell — contrato canônico de página Admin V2 (Sprint 0).
 * Composição: `.admin-v2-page` + PageHeader + slots kpi/children.
 */
export function PageShell({
  title,
  subtitle,
  filters,
  actions,
  kpi,
  children,
  className,
}: PageShellProps) {
  return (
    <div className={cn('admin-v2-page admin-v2-stack', className)}>
      <PageHeader title={title} subtitle={subtitle} filters={filters} actions={actions} />
      {kpi ? <div className="admin-v2-grid-kpi">{kpi}</div> : null}
      {children}
    </div>
  )
}
