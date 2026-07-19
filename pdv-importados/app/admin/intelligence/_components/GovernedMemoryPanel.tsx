import { SectionCard } from '@/components/ui/admin-v2'
import type { GovernedMemoryProjection } from '@/lib/decision-intelligence'

type Props = { data: GovernedMemoryProjection }

/** Espelha Memory governada — outcomes humanos, sem regras. */
export function GovernedMemoryPanel({ data }: Props) {
  return (
    <SectionCard
      title="Governed Memory"
      subtitle={`${data.entryCount} registro(s) de outcome humano`}
    >
      {data.items.length === 0 ? (
        <p className="text-body text-fg-subtle">
          Nenhum outcome humano registrado na Memory governada.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {data.items.map((item) => (
            <li key={item.entryId} className="py-2 text-caption">
              <span className="font-medium text-fg">{item.eventKind}</span>
              <span className="text-fg-subtle">
                {' '}
                · {item.decisionStatus} · {item.decisionReason}
                {item.metricCode
                  ? ` · ${item.metricCode} expected=${item.expectedValue ?? '—'} actual=${item.actualValue ?? '—'}`
                  : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
