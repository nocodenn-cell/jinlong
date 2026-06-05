/**
 * FastProduct Admin — ActivityFeed (Fase 2)
 *
 * Lista vertical de eventos operacionais recentes (vendas, cancelamentos,
 * abertura/fechamento de caixa, aprovações de desconto). Cada item tem um
 * ponto colorido por tipo + descrição + tempo relativo já formatado.
 *
 * Componente puro: recebe `items` por prop, não faz query. server-safe.
 *
 * Nota: o tipo `discount` (âmbar) representa "gerente aprovou desconto acima
 * do limite" — fluxo ainda inexistente no sistema, mas a tipagem já está
 * pronta para quando ele chegar.
 */

import {
  ArrowDownLeft,
  BadgePercent,
  DoorClosed,
  DoorOpen,
  ShoppingCart,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
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

const TYPE_CONFIG: Record<
  ActivityItem['type'],
  { severity: Severity; icon: LucideIcon }
> = {
  sale: { severity: 'ok', icon: ShoppingCart },
  cancel: { severity: 'critical', icon: XCircle },
  cashopen: { severity: 'info', icon: DoorOpen },
  cashclose: { severity: 'neutral', icon: DoorClosed },
  discount: { severity: 'warning', icon: BadgePercent },
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
  className,
}: {
  items: ActivityItem[]
  emptyLabel?: string
  className?: string
}) {
  if (items.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-[10px] px-4 py-10 text-center text-[12px]',
          className
        )}
        style={{
          background: 'var(--fp-bg-card)',
          border: '1px solid var(--fp-border)',
          color: 'var(--fp-text-muted)',
        }}
      >
        {emptyLabel}
      </div>
    )
  }

  return (
    <ul
      className={cn('flex flex-col rounded-[10px] overflow-hidden', className)}
      style={{
        background: 'var(--fp-bg-card)',
        border: '1px solid var(--fp-border)',
      }}
    >
      {items.map((item, i) => {
        const cfg = TYPE_CONFIG[item.type]
        const Icon = cfg.icon
        const isCredit = item.type === 'sale'
        return (
          <li
            key={item.id}
            className="flex items-center gap-3 px-3.5 py-2.5"
            style={
              i > 0 ? { borderTop: '1px solid var(--fp-border-subtle)' } : undefined
            }
          >
            <span className="flex shrink-0 items-center gap-2">
              <SeverityDot severity={cfg.severity} />
              <Icon
                size={14}
                strokeWidth={2}
                aria-hidden
                style={{ color: 'var(--fp-text-muted)' }}
              />
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
                className="shrink-0 inline-flex items-center gap-0.5 text-[12px] font-medium tabular-nums"
                style={{
                  color: isCredit ? 'var(--fp-success)' : 'var(--fp-text-secondary)',
                }}
              >
                {isCredit ? <ArrowDownLeft size={11} strokeWidth={2.5} aria-hidden /> : null}
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
