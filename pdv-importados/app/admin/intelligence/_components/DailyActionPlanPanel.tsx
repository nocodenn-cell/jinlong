import { SectionCard } from '@/components/ui/admin-v2'
import type { DailyActionPlanProjection } from '@/lib/decision-intelligence'
import { SsotDeepLink } from './SsotDeepLink'

type Props = { data: DailyActionPlanProjection }

/** Espelha `dailyActionPlan` — sem recalcular planos. */
export function DailyActionPlanPanel({ data }: Props) {
  return (
    <SectionCard
      title="Daily Action Plans"
      subtitle={data.planDate ? `Plano ${data.planDate}` : 'Sem data de plano'}
    >
      {data.plans.length === 0 ? (
        <p className="text-body text-fg-subtle">Nenhum action plan projetado.</p>
      ) : (
        <ul className="space-y-4">
          {data.plans.map((plan) => (
            <li key={plan.planId}>
              <p className="text-body font-medium text-fg">{plan.objectiveCode}</p>
              <p className="mb-2 text-caption text-fg-subtle">
                urgência {plan.urgency} · {plan.items.length} item(ns)
              </p>
              <ul className="space-y-2 border-l border-[var(--color-border)] pl-3">
                {plan.items.map((item) => (
                  <li key={item.itemId} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-caption text-fg">
                      {item.titleCode} · {item.status}
                    </span>
                    <SsotDeepLink hint={item.deepLinkHint} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
