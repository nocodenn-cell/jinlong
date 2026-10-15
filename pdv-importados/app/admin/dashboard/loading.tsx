import { Skeleton } from '@/components/ui/skeleton'

/**
 * Carregamento do Dashboard: esqueleto na hierarquia do conteúdo final — KPIs → gráfico →
 * tabela — para o layout não "pular" quando os dados chegam. Só chrome visual, sem fetch.
 */
export default function DashboardLoading() {
  return (
    <div
      className="admin-v2-page admin-v2-stack min-h-[40vh]"
      aria-busy="true"
      aria-live="polite"
      data-testid="dashboard-loading"
    >
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="mt-2 h-9 w-full max-w-md" />
      </div>

      {/* Mesmo grid do KpiStrip: os cards não mudam de coluna quando os dados chegam. */}
      <div data-skeleton="kpis" className="admin-v2-grid-kpi">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>

      <div data-skeleton="chart" className="grid gap-4 lg:grid-cols-3">
        <div className="admin-v2-panel space-y-3 rounded-lg p-4 lg:col-span-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-[260px] w-full" />
        </div>
        <div className="admin-v2-panel space-y-3 rounded-lg p-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-[260px] w-full" />
        </div>
      </div>

      <div data-skeleton="table" className="admin-v2-panel space-y-2 rounded-lg p-3">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  )
}
