import { SectionCard } from '@/components/ui/admin-v2'
import type { RecommendationQueueProjection } from '@/lib/decision-intelligence'
import { SsotDeepLink } from './SsotDeepLink'

type Props = { data: RecommendationQueueProjection }

/** Espelha `recommendationQueue` — sem recalcular recomendações. */
export function RecommendationQueuePanel({ data }: Props) {
  return (
    <SectionCard
      title="Recommendation Queue"
      subtitle={`Abertas ${data.openCount} · decididas ${data.decidedCount}`}
    >
      {data.items.length === 0 ? (
        <p className="text-body text-fg-subtle">Nenhuma recomendação projetada.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {data.items.map((item) => (
            <li key={item.recommendationId} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-body font-medium text-fg">{item.recommendationCode}</p>
                <p className="text-caption text-fg-subtle">
                  {item.problemCode} · urgência {item.urgency} · status{' '}
                  {item.decisionStatus ?? 'pendente'}
                </p>
              </div>
              <SsotDeepLink hint={item.deepLinkHint} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
