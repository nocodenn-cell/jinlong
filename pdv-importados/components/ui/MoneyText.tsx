import { cn } from '@/lib/utils'
import { formatBRL } from '@/lib/format/money'

type MoneyTextProps = {
  value: number
  locale?: string
  className?: string
  /** Alinhamento tipográfico (tabelas: right). */
  align?: 'left' | 'right' | 'center'
}

/**
 * MoneyText — valor monetário tabular (Sprint 0 / IX-TABLE).
 */
export function MoneyText({
  value,
  locale = 'pt-BR',
  className,
  align = 'right',
}: MoneyTextProps) {
  const alignCn =
    align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'
  return (
    <span className={cn('tabular-nums', alignCn, className)}>{formatBRL(value, locale)}</span>
  )
}
