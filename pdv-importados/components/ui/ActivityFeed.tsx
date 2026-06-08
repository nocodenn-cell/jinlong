/**
 * FastProduct Admin — ActivityFeed (Admin V2)
 *
 * Lista vertical de eventos operacionais recentes com marcador por severidade.
 * O layout suporta modo padrão (card) e `embedded` para uso dentro de
 * SectionCard sem borda duplicada.
 */

import { cn } from '@/lib/utils'
import { SeverityDot, type Severity } from './badges'

export type ActivityItem = {
  id: string
  type: 'sale' | 'cancel' | 'cashopen' | 'cashclose' | 'discount'
  description: string
  amount?: number
  /** Já formatado: "há 4 min". */
  relativeTime: string
}

const TYPE_CONFIG: Record<ActivityItem['type'], { severity: Severity }> = {
  sale: { severity: 'ok' },
  cancel: { severity: 'critical' },
  cashopen: { severity: 'info' },
  cashclose: { severity: 'neutral' },
  discount: { severity: 'warning' },
}

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function formatAmount(value: number): string {
  return brl.format(value)
}

export function ActivityFeed({
  items,
  emptyLabel = 'Sem atividade recente',
  variant = 'default',
  className,
}: {
  items: ActivityItem[]
  emptyLabel?: string
  variant?: 'default' | 'embedded'
  className?: string
}) {
  const embedded = variant === 'embedded'

  if (items.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-[10px] px-4 py-10 text-center text-[12px]',
          embedded && 'admin-v2-activity-feed--embedded',
          className
        )}
        style={
          embedded
            ? { color: 'var(--fp-text-muted)' }
            : {
                background: 'var(--fp-bg-card)',
                border: '1px solid var(--fp-border)',
                color: 'var(--fp-text-muted)',
              }
        }
      >
        {emptyLabel}
      </div>
    )
  }

  return (
    <ul
      className={cn(
        'flex flex-col overflow-hidden rounded-[10px]',
        embedded && 'admin-v2-activity-feed--embedded',
        className
      )}
      style={
        embedded
          ? undefined
          : {
              background: 'var(--fp-bg-card)',
              border: '1px solid var(--fp-border)',
            }
      }
    >
      {items.map((item, i) => {
        const cfg = TYPE_CONFIG[item.type]
        return (
          <li
            key={item.id}
            className="flex items-center gap-3 px-3.5 py-2.5"
            style={
              i > 0 ? { borderTop: '1px solid var(--fp-border-subtle)' } : undefined
            }
          >
            <span className="flex shrink-0 items-center">
              <SeverityDot severity={cfg.severity} />
            </span>

            <span
              className="min-w-0 flex-1 truncate text-[12px]"
              style={{ color: 'var(--fp-text-primary)' }}
              title={item.description}
            >
              {item.description}
            </span>

            {typeof item.amount === 'number' ? (
              <span
                className="shrink-0 inline-flex items-center text-[12px] font-medium tabular-nums"
                style={{
                  color: item.type === 'sale' ? 'var(--fp-success)' : 'var(--fp-text-secondary)',
                }}
              >
                {formatAmount(item.amount)}
              </span>
            ) : null}

            <span
              className="shrink-0 text-[11px] tabular-nums"
              style={{ color: 'var(--fp-text-muted)' }}
            >
              {item.relativeTime}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
