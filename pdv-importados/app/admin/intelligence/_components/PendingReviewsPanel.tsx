import { SectionCard } from '@/components/ui/admin-v2'
import type { PendingReviewsProjection } from '@/lib/decision-intelligence'

type Props = { data: PendingReviewsProjection }

/** Espelha pendências já projetadas (undecided / deferred). */
export function PendingReviewsPanel({ data }: Props) {
  return (
    <SectionCard title="Pending Reviews" subtitle={`${data.items.length} item(ns)`}>
      {data.items.length === 0 ? (
        <p className="text-body text-fg-subtle">Nenhuma revisão pendente.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {data.items.map((item, idx) => (
            <li
              key={`${item.kind}:${item.recommendationId}:${item.decisionId ?? idx}`}
              className="py-2 text-caption"
            >
              <span className="font-medium text-fg">{item.kind}</span>
              <span className="text-fg-subtle">
                {' '}
                · {item.recommendationCode ?? item.recommendationId}
                {item.reviewDate ? ` · revisar em ${item.reviewDate}` : ''}
                {item.decisionReason ? ` · ${item.decisionReason}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
