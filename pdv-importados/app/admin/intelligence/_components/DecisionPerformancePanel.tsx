import { SectionCard } from '@/components/ui/admin-v2'
import type { DecisionPerformanceProjection } from '@/lib/decision-intelligence'

type Props = { data: DecisionPerformanceProjection }

/** Espelha expected/actual já gravados — não recalcula métricas. */
export function DecisionPerformancePanel({ data }: Props) {
  return (
    <SectionCard
      title="Decision Performance"
      subtitle={`${data.sampleCount} amostra(s) com expected e actual`}
    >
      {data.samples.length === 0 ? (
        <p className="text-body text-fg-subtle">Sem amostras de performance gravadas.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {data.samples.map((s) => (
            <li key={`${s.decisionId}:${s.metricCode}`} className="py-2 text-caption">
              <span className="font-medium text-fg">{s.metricCode}</span>
              <span className="text-fg-subtle">
                {' '}
                · esperado {s.expectedValue}
                {s.unit ? ` ${s.unit}` : ''} · atual {s.actualValue}
                {s.unit ? ` ${s.unit}` : ''} · Δ {s.storedDelta}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
