import { SectionCard } from '@/components/ui/admin-v2'
import type { CriticalAlertsProjection } from '@/lib/decision-intelligence'

type Props = { data: CriticalAlertsProjection }

/** Espelha alertas com severity CRITICAL já definida no Core. */
export function CriticalAlertsPanel({ data }: Props) {
  return (
    <SectionCard title="Critical Alerts" subtitle={`${data.items.length} alerta(s) críticos`}>
      {data.items.length === 0 ? (
        <p className="text-body text-fg-subtle">Nenhum alerta crítico projetado.</p>
      ) : (
        <ul className="space-y-3">
          {data.items.map((item) => (
            <li
              key={item.alertId}
              className="rounded-md border border-[var(--color-border)] px-3 py-2"
            >
              <p className="text-body font-medium text-fg">{item.titleCode}</p>
              <p className="text-caption text-fg-subtle">
                score {item.urgencyScore} · {item.urgencyReason}
              </p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
