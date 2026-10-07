import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type DashboardGridProps = {
  /** Faixa de KPIs (tipicamente `KpiStrip`). */
  kpis?: ReactNode
  /** Coluna principal (charts / tabelas densas) — 8/12 em lg. */
  main?: ReactNode
  /** Coluna lateral (alertas / resumos) — 4/12 em lg. */
  side?: ReactNode
  /** Linha full-width abaixo do grid 8+4 (tabelas, feeds). */
  footer?: ReactNode
  className?: string
}

/**
 * DashboardGrid — layout executivo limpo: KPI → main/side → footer.
 */
export function DashboardGrid({ kpis, main, side, footer, className }: DashboardGridProps) {
  const hasSplit = main != null || side != null

  return (
    <div className={cn('admin-v2-dashboard-grid flex flex-col gap-4', className)} data-testid="dashboard-grid">
      {kpis ? <div className="admin-v2-dashboard-grid__kpis">{kpis}</div> : null}
      {hasSplit ? (
        <div className="admin-v2-dashboard-grid__split grid gap-4 lg:grid-cols-12">
          {main != null ? (
            <div className="admin-v2-dashboard-grid__main flex min-w-0 flex-col gap-4 lg:col-span-8">
              {main}
            </div>
          ) : null}
          {side != null ? (
            <div className="admin-v2-dashboard-grid__side flex min-w-0 flex-col gap-4 lg:col-span-4">
              {side}
            </div>
          ) : null}
        </div>
      ) : null}
      {footer ? <div className="admin-v2-dashboard-grid__footer">{footer}</div> : null}
    </div>
  )
}
