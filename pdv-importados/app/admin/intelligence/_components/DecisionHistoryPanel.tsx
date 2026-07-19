import { SectionCard } from '@/components/ui/admin-v2'
import type { DecisionHistoryProjection } from '@/lib/decision-intelligence'

type Props = { data: DecisionHistoryProjection }

/** Espelha histórico de DecisionRecords já projetados. */
export function DecisionHistoryPanel({ data }: Props) {
  return (
    <SectionCard title="Decision History" subtitle={`${data.items.length} registro(s)`}>
      {data.items.length === 0 ? (
        <p className="text-body text-fg-subtle">Nenhuma decisão registrada.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-caption">
            <thead className="text-fg-subtle">
              <tr>
                <th className="py-2 pr-3 font-medium">Quando</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Motivo</th>
                <th className="py-2 font-medium">Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.decisionId} className="border-t border-[var(--color-border)]">
                  <td className="py-2 pr-3 text-fg">{item.decisionAt}</td>
                  <td className="py-2 pr-3 text-fg">{item.status}</td>
                  <td className="py-2 pr-3 text-fg">{item.decisionReason}</td>
                  <td className="py-2 font-mono text-fg-subtle">{item.recommendationId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  )
}
