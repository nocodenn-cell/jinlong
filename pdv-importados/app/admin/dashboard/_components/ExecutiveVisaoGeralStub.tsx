import { Suspense, type ReactNode } from 'react'
import {
  DashboardGrid,
  DenseDataTable,
  ExecutiveAnalyticsHubNav,
  ExecutivePageHeader,
  KpiStrip,
  StatusBadge,
  type KpiStripItem,
  type PageActionSecondaryItem,
} from '@/components/ui/admin-v2'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ROUTES } from '@/lib/navigation/routes'
import { executiveRelatoriosHref } from '@/lib/navigation/executiveViews'

type AlertRow = {
  id: string
  label: string
  detail: string
  tone: 'success' | 'warning' | 'danger' | 'neutral'
}

type ExecutiveVisaoGeralStubProps = {
  title: string
  subtitle?: string
  filters?: ReactNode
  kpis: readonly KpiStripItem[]
  main: ReactNode
  side?: ReactNode
  footer?: ReactNode
  /** Alertas rápidos para validar StatusBadge + DenseDataTable (Fase 1). */
  alertRows?: readonly AlertRow[]
  secondaryActions?: readonly PageActionSecondaryItem[]
}

const DEFAULT_SECONDARY: readonly PageActionSecondaryItem[] = [
  {
    id: 'abrir-relatorios',
    label: 'Relatórios detalhados',
    href: ROUTES.admin.relatorios,
  },
  {
    id: 'vendas-caixas',
    label: 'Ir para Vendas & Caixas',
    href: executiveRelatoriosHref('vendas-caixas'),
  },
  {
    id: 'export-placeholder',
    label: 'Exportar PDF (em breve)',
    disabled: true,
  },
]

/**
 * Stub de validação da Fase 1 — Visão Geral com primitivas executivas.
 * Consome dados reais via `kpis` / slots; não altera regras de negócio.
 */
export function ExecutiveVisaoGeralStub({
  title,
  subtitle,
  filters,
  kpis,
  main,
  side,
  footer,
  alertRows = [],
  secondaryActions = DEFAULT_SECONDARY,
}: ExecutiveVisaoGeralStubProps) {
  const alertsPanel =
    alertRows.length > 0 ? (
      <div className="rounded-card border border-[var(--color-border)] p-3" data-testid="executive-alerts-stub">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-small font-semibold text-fg">Alertas rápidos</h2>
          <StatusBadge tone="neutral">Fase 1</StatusBadge>
        </div>
        <DenseDataTable
          caption="Alertas executivos"
          rows={alertRows}
          rowKey={(row) => row.id}
          columns={[
            {
              id: 'status',
              header: 'Status',
              cell: (row) => <StatusBadge tone={row.tone}>{row.label}</StatusBadge>,
            },
            {
              id: 'detail',
              header: 'Detalhe',
              numeric: true,
              cell: (row) => row.detail,
            },
          ]}
        />
      </div>
    ) : null

  return (
    <div className="admin-v2-page admin-v2-stack" data-executive-layout="fase1">
      <ExecutivePageHeader
        title={title}
        subtitle={subtitle}
        filters={filters}
        primaryActions={
          <Button asChild variant="secondary" size="sm">
            <Link href={executiveRelatoriosHref('vendas-caixas')}>Vendas & Caixas</Link>
          </Button>
        }
        secondaryActions={secondaryActions}
        secondaryActionsLabel="Mais ações"
      />

      <Suspense fallback={null}>
        <ExecutiveAnalyticsHubNav activeView="visao-geral" />
      </Suspense>

      <DashboardGrid
        kpis={<KpiStrip items={kpis} />}
        main={main}
        side={
          <>
            {alertsPanel}
            {side}
          </>
        }
        footer={footer}
      />
    </div>
  )
}
