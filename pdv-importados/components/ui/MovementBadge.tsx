import { cn } from '@/lib/utils'

type MovementBadgeProps = Readonly<{
  /** Delta assinado (positivo = entrada, negativo = saída). */
  delta: number
  className?: string
}>

/**
 * MovementBadge — quantidade com sinal (+/−) para kardex / extratos.
 * Reutilizável em Estoque e futuros ledgers (Financeiro).
 */
export function MovementBadge({ delta, className }: MovementBadgeProps) {
  const entrada = delta >= 0
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center text-caption font-semibold tabular-nums',
        entrada ? 'text-[var(--color-success-strong)]' : 'text-[var(--color-danger-strong)]',
        className,
      )}
    >
      {entrada ? '+' : '−'}
      {Math.abs(delta)}
    </span>
  )
}
