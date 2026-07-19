import { MetricCard, SectionCard } from '@/components/ui/admin-v2'
import type { ExecutiveDashboardProjection } from '@/lib/decision-intelligence'

type Props = { data: ExecutiveDashboardProjection }

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

/** Espelha `executiveDashboard` — sem recalcular KPIs/Findings. */
export function ExecutiveDashboardPanel({ data }: Props) {
  const d = data.decisionCounts
  return (
    <SectionCard
      title="Executive Dashboard"
      subtitle={`Confiança operacional ${pct(data.operationalConfidence)} · snapshot ${data.snapshotVersion ?? '—'}`}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="KPIs suportados" value={String(data.kpiSummary.supported)} icon="file-check-2" />
        <MetricCard label="Findings críticos" value={String(data.findingSummary.critical)} icon="alert-circle" tone="danger" />
        <MetricCard label="Alertas críticos" value={String(data.alertSummary.critical)} icon="alert-circle" tone="danger" />
        <MetricCard label="Recomendações" value={String(data.recommendationCount)} icon="list-filter" />
      </div>
      <div className="mt-4 grid gap-2 text-caption text-fg-subtle sm:grid-cols-2">
        <p>
          Headlines:{' '}
          <span className="text-fg">
            {data.headlineCodes.length > 0 ? data.headlineCodes.join(', ') : '—'}
          </span>
        </p>
        <p>
          Decisões: {d.total} (aceitadas {d.accepted} · rejeitadas {d.rejected} ·
          adiadas {d.deferred} · executadas {d.executed})
        </p>
        <p>Action plans: {data.actionPlanCount}</p>
        <p>Composed at: {data.composedAt || '—'}</p>
      </div>
    </SectionCard>
  )
}
