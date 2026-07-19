import { cn } from '@/lib/utils'

export type QuantitySeverity = 'zero' | 'low' | 'ok' | 'empty'

type QuantityCellProps = Readonly<{
  value: number | null | undefined
  /** Limite para severidade `low` (ex.: estoque mínimo). */
  threshold?: number | null
  className?: string
}>

export function quantitySeverity(
  value: number | null | undefined,
  threshold?: number | null,
): QuantitySeverity {
  if (value == null) return 'empty'
  if (value <= 0) return 'zero'
  if (threshold != null && value <= threshold) return 'low'
  return 'ok'
}

const SEV_CLASS: Record<QuantitySeverity, string> = {
  empty: 'text-fg-subtle',
  zero: 'font-semibold text-[var(--color-danger-strong)]',
  low: 'font-semibold text-[var(--color-warning-strong)]',
  ok: 'tabular-nums text-[var(--color-success-strong)]',
}

/**
 * QuantityCell — quantidade com severidade visual (saldo / limites).
 * Tokens semânticos; serve Estoque e KPIs numéricos de outros módulos.
 */
export function QuantityCell({ value, threshold, className }: QuantityCellProps) {
  const sev = quantitySeverity(value, threshold)
  if (sev === 'empty') {
    return <span className={cn(SEV_CLASS.empty, className)}>—</span>
  }
  return <span className={cn(SEV_CLASS[sev], 'tabular-nums', className)}>{value}</span>
}
