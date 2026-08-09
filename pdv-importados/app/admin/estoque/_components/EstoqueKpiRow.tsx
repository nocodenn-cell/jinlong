import Link from 'next/link'
import { cn } from '@/lib/utils'

export type EstoqueKpiItem = Readonly<{
  key: string
  label: string
  value: number
  href: string
  active: boolean
  tone?: 'default' | 'warning'
}>

type Props = Readonly<{
  items: readonly EstoqueKpiItem[]
  ariaLabel: string
}>

/**
 * Atalhos de visão (KPI) — só deep-link nos filtros já existentes.
 */
export function EstoqueKpiRow({ items, ariaLabel }: Props) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:max-w-md"
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.active ? 'page' : undefined}
          className={cn(
            'flex flex-col gap-0.5 rounded-card border px-3 py-2.5 transition-colors',
            item.active
              ? 'border-[var(--color-info-border)] bg-[var(--color-info-bg)]'
              : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-soft)]',
          )}
        >
          <span className="text-caption text-fg-subtle">{item.label}</span>
          <span
            className={cn(
              'text-h3 font-semibold tabular-nums',
              item.tone === 'warning' && item.value > 0
                ? 'text-[var(--color-warning-strong)]'
                : 'text-fg',
            )}
          >
            {item.value}
          </span>
        </Link>
      ))}
    </div>
  )
}
