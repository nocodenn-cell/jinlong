import { SectionCard } from '@/components/ui/admin-v2'
import type { RecommendationQueueProjection } from '@/lib/decision-intelligence'
import { DecisionActions } from './DecisionActions'
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
            <li
              key={item.recommendationId}
              className="flex flex-col gap-2 py-3 lg:flex-row lg:items-center lg:justify-between"
            >
              <div>
                <p className="text-body font-medium text-fg">{item.recommendationCode}</p>
                <p className="text-caption text-fg-subtle">
                  {item.problemCode} · urgência {item.urgency} · status{' '}
                  {item.decisionStatus ?? 'pendente'}
                </p>
                <div className="mt-1">
                  <SsotDeepLink hint={item.deepLinkHint} />
                </div>
              </div>
              {!item.decisionStatus ? (
                <DecisionActions recommendationId={item.recommendationId} />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
